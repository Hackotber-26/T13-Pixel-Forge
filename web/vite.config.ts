import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // One origin for web + API, so a single tunnel serves both during WhatsApp testing.
    proxy: {
      '/api': { target: 'http://localhost:8000', rewrite: (p) => p.replace(/^\/api/, '') },
      '/webhook': { target: 'http://localhost:8000' },
    },
    // IPv4 loopback so the Cloudflare tunnel (http://127.0.0.1:5173) always reaches it.
    host: '127.0.0.1',
    allowedHosts: true,
  },
})
