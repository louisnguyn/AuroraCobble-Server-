import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  /** Avoid stale pre-bundles after adding deps (504 "Outdated Optimize Dep" until restart). */
  optimizeDeps: {
    include: ['react-markdown'],
  },
  server: {
    proxy: {
        // rewrite: (path) => path.replace(/^\/api/, ''),
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
