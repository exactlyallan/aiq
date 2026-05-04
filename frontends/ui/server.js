// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Gateway Server
 *
 * Architecture (following Nemo-Agent-Toolkit-UI pattern):
 * - Runs on port 3000 as the main entry point
 * - Proxies to Next.js server (dev on 3001, or production on same process)
 *
 * Development:
 *   npm run dev - Runs gateway + Next.js dev server concurrently
 *
 * Production:
 *   npm start - Runs Next.js in production mode with integrated proxy
 *
 * Environment:
 *   BACKEND_URL - Backend service URL (e.g., http://backend:8000)
 *   PORT - Gateway port (default: 3000)
 *   NEXT_INTERNAL_URL - Next.js server URL (default: http://localhost:3001)
 */

const http = require('http')
const httpProxy = require('http-proxy')
const { parse } = require('url')

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)

const getBackendUrl = () => {
  const url = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
  return url.replace(/\/$/, '')
}

const BACKEND_HTTP_URL = getBackendUrl()
const NEXT_INTERNAL_URL = process.env.NEXT_INTERNAL_URL || 'http://localhost:3001'

// In production, we run Next.js in the same process
let nextApp = null
let nextHandle = null

if (!dev) {
  const next = require('next')
  nextApp = next({ dev: false, hostname, port: 3001 })
  nextHandle = nextApp.getRequestHandler()
}

// Create proxy for Next.js (used in dev mode)
const nextProxy = httpProxy.createProxyServer({
  target: NEXT_INTERNAL_URL,
  changeOrigin: true,
  ws: true,
  xfwd: true,
  preserveHeaderKeyCase: true,
})

// Error handling for Next.js proxy
nextProxy.on('error', (err, req, res) => {
  console.error('[Next.js Proxy Error]:', err.message)
  if (res && res.writeHead && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
  }
  if (res && !res.writableEnded) {
    res.end(JSON.stringify({ error: 'Next.js server unavailable' }))
  }
})

const startServer = async () => {
  // In production, prepare Next.js
  if (!dev && nextApp) {
    await nextApp.prepare()
  }

  const server = http.createServer(async (req, res) => {
    req.socket.setKeepAlive?.(true, 15000)
    req.socket.setTimeout?.(0)

    let parsedUrl
    try {
      parsedUrl = parse(req.url, true)
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('Bad Request')
      return
    }

    if (dev) {
      // Development: proxy everything to Next.js dev server
      nextProxy.web(req, res, { target: NEXT_INTERNAL_URL })
    } else {
      // Production: handle with Next.js directly
      try {
        await nextHandle(req, res, parsedUrl)
      } catch (err) {
        console.error('Error handling request:', err)
        res.statusCode = 500
        res.end('Internal Server Error')
      }
    }
  })

  // WebSocket upgrade handler
  server.on('upgrade', (req, socket, head) => {
    socket.setKeepAlive?.(true, 15000)
    socket.setTimeout?.(0)

    try {
      parse(req.url, true)
    } catch {
      socket.destroy()
      return
    }

    // WebSocket upgrades are only for framework internals such as HMR.
    if (dev) {
      // Development: proxy to Next.js dev server
      nextProxy.ws(req, socket, head, { target: NEXT_INTERNAL_URL }, (err) => {
        if (err) {
          console.error('[Next.js WS] Proxy error:', err.message)
          socket.destroy()
        }
      })
    } else {
      // Production: let Next.js handle it
      const upgradeHandler = nextApp.getUpgradeHandler()
      upgradeHandler(req, socket, head)
    }
  })

  // Server configuration for long-running connections
  server.keepAliveTimeout = 0
  server.headersTimeout = 65000
  server.requestTimeout = 0

  server.listen(port, hostname, () => {
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Frontend: http://localhost:${port}
  Backend:  ${BACKEND_HTTP_URL}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
  })

  // Graceful shutdown
  const cleanExit = (signal) => {
    console.log(`\nShutting down (${signal})...`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 2000)
  }

  process.once('SIGTERM', () => cleanExit('SIGTERM'))
  process.once('SIGINT', () => cleanExit('SIGINT'))
}

startServer().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
