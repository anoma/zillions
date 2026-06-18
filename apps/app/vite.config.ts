import react from '@vitejs/plugin-react'
import type { Connect } from 'vite'
import { defineConfig, type Plugin } from 'vite'

const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

const applyHeaders = (middlewares: Connect.Server) => {
  middlewares.use((_req, res, next) => {
    for (const [key, value] of Object.entries(crossOriginIsolationHeaders)) {
      res.setHeader(key, value)
    }
    next()
  })
}

const crossOriginIsolationPlugin: Plugin = {
  name: 'cross-origin-isolation',
  configureServer(server) { applyHeaders(server.middlewares) },
  configurePreviewServer(server) { applyHeaders(server.middlewares) },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), crossOriginIsolationPlugin],
})
