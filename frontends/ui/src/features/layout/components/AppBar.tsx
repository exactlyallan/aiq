// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * AppBar Component
 *
 * Top navigation bar with the app brand, current session title, and account modal.
 */

'use client'

import { type FC, memo, useCallback, useMemo, useState } from 'react'
import { Avatar, Button, ButtonGroup, Divider, Flex, Logo, Popover, Text } from '@/adapters/ui'
import { Book, Lock, Logout, User as UserIcon } from '@/adapters/ui/icons'
import { useLayoutStore } from '../store'
import type { ThemeMode } from '../types'

const DOCUMENTATION_URL = 'https://github.com/NVIDIA-AI-Blueprints/aiq'

const THEME_OPTIONS: Array<{ label: string; value: ThemeMode }> = [
  { label: 'Auto', value: 'system' },
  { label: 'Dark', value: 'dark' },
  { label: 'Light', value: 'light' },
]

interface AppBarProps {
  /** Current session title to display */
  sessionTitle?: string
  /** Whether the user is authenticated */
  isAuthenticated?: boolean
  /** Whether authentication is required (false = using default user) */
  authRequired?: boolean
  /** User info for avatar */
  user?: {
    name?: string
    email?: string
    image?: string
  }
  /** Callback when sign in is clicked */
  onSignIn?: () => void
  /** Callback when sign out is clicked */
  onSignOut?: () => void
}

/**
 * Main navigation bar at the top of the application.
 * Keeps global navigation separate from the persistent research-session rail.
 */
export const AppBar: FC<AppBarProps> = memo(function AppBar({
  sessionTitle = 'New Session',
  isAuthenticated = false,
  authRequired = false,
  user,
  onSignIn,
  onSignOut,
}) {
  const [isAccountPopoverOpen, setIsAccountPopoverOpen] = useState(false)
  const theme = useLayoutStore((s) => s.theme)
  const setTheme = useLayoutStore((s) => s.setTheme)

  const displayName = useMemo(
    () => getAccountDisplayName({ authRequired, isAuthenticated, user }),
    [authRequired, isAuthenticated, user]
  )
  const avatarFallback = displayName.charAt(0).toUpperCase()

  const handleSignIn = useCallback(() => {
    setIsAccountPopoverOpen(false)
    onSignIn?.()
  }, [onSignIn])

  const handleSignOut = useCallback(() => {
    setIsAccountPopoverOpen(false)
    onSignOut?.()
  }, [onSignOut])

  const handleThemeChange = useCallback(
    (nextTheme: ThemeMode) => {
      setTheme(nextTheme)
    },
    [setTheme]
  )

  return (
    <header className="border-base border-b">
      <Flex align="center" justify="between" className="h-[var(--header-height)] gap-4 px-4">
        {/* Left section: brand + current session context */}
        <Flex align="center" gap="2" className="min-w-0 flex-1">
          <Flex align="center" gap="density-lg" className="shrink-0">
            <Logo kind="logo-only" size="small" />

            <Text kind="label/semibold/lg" className="text-primary whitespace-nowrap">
              AI-Q
            </Text>
          </Flex>

          {isAuthenticated && (
            <div className="ml-4 hidden min-w-0 flex-1 items-center md:flex">
              <Text
                kind="body/regular/md"
                className="text-subtle block w-full max-w-[360px] truncate lg:max-w-[480px] xl:max-w-[560px]"
              >
                {sessionTitle}
              </Text>
            </div>
          )}
        </Flex>

        <Popover
          open={isAccountPopoverOpen}
          onOpenChange={setIsAccountPopoverOpen}
          side="bottom"
          align="end"
          className="border-0 bg-transparent p-0 shadow-none"
          slotContent={
            <AccountPopoverContent
              authRequired={authRequired}
              isAuthenticated={isAuthenticated}
              user={user}
              displayName={displayName}
              theme={theme}
              onSignIn={handleSignIn}
              onSignOut={handleSignOut}
              onThemeChange={handleThemeChange}
            />
          }
        >
          <Button
            kind={authRequired && !isAuthenticated ? 'secondary' : 'tertiary'}
            size="small"
            aria-label={getAccountButtonLabel({ authRequired, isAuthenticated, displayName })}
            title={getAccountButtonTitle({ authRequired, isAuthenticated, displayName })}
            className="ml-2 min-w-9 px-2"
          >
            <Flex align="center" gap="2" className="min-w-0">
              {authRequired && !isAuthenticated ? (
                <Lock className="h-4 w-4 shrink-0" />
              ) : (
                <Avatar
                  size="small"
                  src={user?.image}
                  fallback={avatarFallback}
                />
              )}
              <Text kind="label/regular/sm" className="hidden max-w-[160px] truncate sm:block">
                {authRequired && !isAuthenticated ? 'Sign In' : displayName}
              </Text>
            </Flex>
          </Button>
        </Popover>
      </Flex>
    </header>
  )
})

interface AccountPopoverContentProps {
  authRequired: boolean
  isAuthenticated: boolean
  user?: AppBarProps['user']
  displayName: string
  theme: ThemeMode
  onSignIn: () => void
  onSignOut: () => void
  onThemeChange: (theme: ThemeMode) => void
}

const AccountPopoverContent: FC<AccountPopoverContentProps> = ({
  authRequired,
  isAuthenticated,
  user,
  displayName,
  theme,
  onSignIn,
  onSignOut,
  onThemeChange,
}) => (
  <Flex
    direction="col"
    gap="4"
    className="bg-surface-base w-[360px] max-w-[calc(100vw-2rem)] rounded-md border border-white p-4 shadow-[0_16px_40px_rgba(0,0,0,0.28)]"
    data-testid="account-popover"
  >
    <Flex align="center" gap="3" className="min-w-0">
      <span
        className="bg-surface-raised text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        aria-hidden="true"
      >
        <UserIcon className="h-5 w-5" />
      </span>
      <Flex direction="col" gap="0" className="min-w-0">
        <Text kind="label/semibold/lg" className="text-primary truncate">
          {displayName}
        </Text>
        {user?.email && isAuthenticated && (
          <Text kind="body/regular/sm" className="text-subtle truncate">
            {user.email}
          </Text>
        )}
      </Flex>
    </Flex>

    <AccountAuthAction
      authRequired={authRequired}
      isAuthenticated={isAuthenticated}
      onSignIn={onSignIn}
      onSignOut={onSignOut}
    />

    <Divider />

    <Flex direction="col" gap="3">
      <Text kind="label/semibold/sm" className="text-primary">
        Settings
      </Text>
      <Flex align="center" justify="between" gap="4" className="min-w-0">
        <Text kind="body/regular/sm" className="text-subtle shrink-0">
          Theme:
        </Text>
        <ButtonGroup
          kind="secondary"
          size="small"
          groupKind="flush"
          aria-label="Theme"
          className="shrink-0"
        >
          {THEME_OPTIONS.map((option) => {
            const isActive = theme === option.value
            return (
              <Button
                key={option.value}
                kind={isActive ? 'primary' : 'secondary'}
                size="small"
                aria-pressed={isActive}
                onClick={() => onThemeChange(option.value)}
              >
                {option.label}
              </Button>
            )
          })}
        </ButtonGroup>
      </Flex>
    </Flex>

    <Divider />

    <Flex direction="col" gap="3">
      <Text kind="label/semibold/sm" className="text-primary">
        Help
      </Text>
      <a
        href={DOCUMENTATION_URL}
        target="_blank"
        rel="noreferrer"
        className="text-primary hover:bg-surface-raised focus-visible:ring-brand flex w-fit items-center gap-2 rounded px-1 py-1 outline-none focus-visible:ring-2"
      >
        <Book className="h-4 w-4" aria-hidden="true" />
        <Text kind="label/regular/sm">Documentation</Text>
      </a>
    </Flex>
  </Flex>
)

interface AccountAuthActionProps {
  authRequired: boolean
  isAuthenticated: boolean
  onSignIn: () => void
  onSignOut: () => void
}

const AccountAuthAction: FC<AccountAuthActionProps> = ({
  authRequired,
  isAuthenticated,
  onSignIn,
  onSignOut,
}) => {
  if (!authRequired) {
    return (
      <Text kind="body/regular/sm" className="text-subtle">
        Not configured
      </Text>
    )
  }

  if (isAuthenticated) {
    return (
      <Button kind="secondary" size="small" onClick={onSignOut} className="w-fit">
        <Flex align="center" gap="2">
          <Logout className="h-4 w-4" />
          <Text kind="label/regular/sm">Sign out</Text>
        </Flex>
      </Button>
    )
  }

  return (
    <Button kind="primary" size="small" onClick={onSignIn} className="w-fit">
      <Flex align="center" gap="2">
        <Lock className="h-4 w-4" />
        <Text kind="label/regular/sm">Sign in</Text>
      </Flex>
    </Button>
  )
}

const getAccountDisplayName = ({
  authRequired,
  isAuthenticated,
  user,
}: {
  authRequired: boolean
  isAuthenticated: boolean
  user?: AppBarProps['user']
}): string => {
  if (!authRequired) return user?.name || 'Default User'
  if (!isAuthenticated) return 'Guest User'
  return user?.name || user?.email || 'User'
}

const getAccountButtonLabel = ({
  authRequired,
  isAuthenticated,
  displayName,
}: {
  authRequired: boolean
  isAuthenticated: boolean
  displayName: string
}): string => {
  if (!authRequired) return `Account menu for ${displayName} - authentication not configured`
  if (!isAuthenticated) return 'Account menu - sign in'
  return `Account menu for ${displayName}`
}

const getAccountButtonTitle = ({
  authRequired,
  isAuthenticated,
  displayName,
}: {
  authRequired: boolean
  isAuthenticated: boolean
  displayName: string
}): string => {
  if (!authRequired) return 'Authentication not configured'
  if (!isAuthenticated) return 'Sign in'
  return `Account settings for ${displayName}`
}
