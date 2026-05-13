// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@/test-utils'
import { within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { AppBar } from './AppBar'

const mockToggleSessionsPanel = vi.fn()
const mockSetTheme = vi.fn()

let mockTheme: 'light' | 'dark' | 'system' = 'system'

const mockState = () => ({
  toggleSessionsPanel: mockToggleSessionsPanel,
  theme: mockTheme,
  setTheme: mockSetTheme,
})

vi.mock('../store', () => ({
  useLayoutStore: Object.assign(
    vi.fn((selector?: (s: any) => any) => {
      const state = mockState()
      return selector ? selector(state) : state
    }),
    { getState: () => mockState() }
  ),
}))

describe('AppBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTheme = 'system'
  })

  test('renders logo and title', () => {
    render(<AppBar />)

    expect(screen.getByText('AI-Q')).toBeInTheDocument()
  })

  test('does not render research session rail controls in the AppBar', () => {
    render(<AppBar isAuthenticated={true} />)

    expect(screen.queryByText('Research Sessions')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /toggle sessions sidebar/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create new session/i })).not.toBeInTheDocument()
  })

  test('opens account modal from unauthenticated sign in control', async () => {
    const user = userEvent.setup()

    render(<AppBar isAuthenticated={false} authRequired={true} />)

    await user.click(screen.getByRole('button', { name: /account menu - sign in/i }))

    expect(screen.getByText('Guest User')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Help')).toBeInTheDocument()
  })

  test('calls onSignIn from the account modal', async () => {
    const user = userEvent.setup()
    const onSignIn = vi.fn()

    render(
      <AppBar
        isAuthenticated={false}
        authRequired={true}
        onSignIn={onSignIn}
      />
    )

    await user.click(screen.getByRole('button', { name: /account menu - sign in/i }))
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(onSignIn).toHaveBeenCalledOnce()
  })

  test('shows session title when authenticated', () => {
    render(<AppBar isAuthenticated={true} sessionTitle="My Research Session" />)

    expect(screen.getByText('My Research Session')).toBeInTheDocument()
  })

  test('does not expose session actions when not authenticated', () => {
    render(<AppBar isAuthenticated={false} />)

    expect(screen.queryByRole('button', { name: /create new session/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /toggle sessions sidebar/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add data sources/i })).not.toBeInTheDocument()
  })

  test('keeps authenticated session actions out of the AppBar', () => {
    render(<AppBar isAuthenticated={true} />)

    expect(screen.queryByRole('button', { name: /create new session/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /toggle sessions sidebar/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add data sources/i })).not.toBeInTheDocument()
  })

  test('creates a new session from the brand button', async () => {
    const user = userEvent.setup()
    const onNewSession = vi.fn()

    render(<AppBar isAuthenticated={true} onNewSession={onNewSession} />)

    expect(screen.getByText('AI-Q')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /start new research session/i }))
    expect(onNewSession).toHaveBeenCalledOnce()
  })

  test('does not own shallow navigation disabled state', () => {
    render(<AppBar isAuthenticated={true} />)

    expect(screen.queryByRole('button', { name: /create new session/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /toggle sessions sidebar/i })
    ).not.toBeInTheDocument()
  })

  test('does not toggle the sessions panel directly', () => {
    render(<AppBar isAuthenticated={true} />)

    expect(
      screen.queryByRole('button', { name: /toggle sessions sidebar/i })
    ).not.toBeInTheDocument()
    expect(mockToggleSessionsPanel).not.toHaveBeenCalled()
  })

  test('does not expose data sources as a permanent nav action', () => {
    render(<AppBar isAuthenticated={true} />)

    expect(screen.queryByRole('button', { name: /add data sources/i })).not.toBeInTheDocument()
  })

  test('renders Documentation link in the account modal', async () => {
    const user = userEvent.setup()

    render(<AppBar isAuthenticated={true} authRequired={true} user={{ name: 'John Doe' }} />)

    expect(screen.queryByRole('link', { name: /documentation/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /account menu for john doe/i }))

    const docsLink = screen.getByRole('link', { name: /documentation/i })
    expect(docsLink).toHaveAttribute('href', 'https://github.com/NVIDIA-AI-Blueprints/aiq')
  })

  test('shows authenticated user in the account modal and signs out', async () => {
    const user = userEvent.setup()
    const onSignOut = vi.fn()

    render(
      <AppBar
        isAuthenticated={true}
        authRequired={true}
        user={{ name: 'John Doe', email: 'john@example.com' }}
        onSignOut={onSignOut}
      />
    )

    await user.click(screen.getByRole('button', { name: /account menu for john doe/i }))

    const popover = screen.getByTestId('account-popover')
    expect(within(popover).getByText('John Doe')).toBeInTheDocument()
    expect(within(popover).getByText('john@example.com')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^sign out$/i }))

    expect(onSignOut).toHaveBeenCalledOnce()
  })

  test('sets theme from the account modal button group', async () => {
    const user = userEvent.setup()

    render(<AppBar isAuthenticated={true} authRequired={true} user={{ name: 'John Doe' }} />)

    await user.click(screen.getByRole('button', { name: /account menu for john doe/i }))
    await user.click(screen.getByRole('button', { name: /^dark$/i }))

    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  test('marks the current theme as pressed', async () => {
    const user = userEvent.setup()
    mockTheme = 'dark'

    render(<AppBar isAuthenticated={true} authRequired={true} user={{ name: 'John Doe' }} />)

    await user.click(screen.getByRole('button', { name: /account menu for john doe/i }))

    expect(screen.getByRole('button', { name: /^dark$/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  describe('auth disabled mode', () => {
    test('shows Default User account button when auth is disabled', () => {
      render(<AppBar isAuthenticated={true} authRequired={false} />)

      const accountButton = screen.getByRole('button', {
        name: /account menu for default user.*authentication not configured/i,
      })
      expect(accountButton).toBeInTheDocument()
    })

    test('does not show direct Sign In button when auth is disabled', () => {
      render(<AppBar isAuthenticated={true} authRequired={false} />)

      expect(screen.queryByRole('button', { name: /^sign in$/i })).not.toBeInTheDocument()
    })

    test('shows auth disabled modal with not configured status when clicked', async () => {
      const user = userEvent.setup()

      render(<AppBar isAuthenticated={true} authRequired={false} />)

      await user.click(
        screen.getByRole('button', {
          name: /account menu for default user.*authentication not configured/i,
        })
      )

      const popover = screen.getByTestId('account-popover')
      expect(within(popover).getByText('Default User')).toBeInTheDocument()
      expect(within(popover).getByText('Not configured')).toBeInTheDocument()
    })

    test('does not show Sign Out button when auth is disabled', async () => {
      const user = userEvent.setup()

      render(<AppBar isAuthenticated={true} authRequired={false} />)

      await user.click(
        screen.getByRole('button', {
          name: /account menu for default user.*authentication not configured/i,
        })
      )

      expect(screen.queryByRole('button', { name: /^sign out$/i })).not.toBeInTheDocument()
    })

    test('session rail actions are not duplicated when auth is disabled', () => {
      render(<AppBar isAuthenticated={true} authRequired={false} />)

      expect(screen.queryByRole('button', { name: /create new session/i })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /toggle sessions sidebar/i })
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /add data sources/i })).not.toBeInTheDocument()
    })

    test('shows session title when auth is disabled', () => {
      render(
        <AppBar isAuthenticated={true} authRequired={false} sessionTitle="My Research Session" />
      )

      expect(screen.getByText('My Research Session')).toBeInTheDocument()
    })
  })
})
