import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Raise the chunk-size warning threshold slightly for the single-bundle app
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 5173,
    // Proxy API calls to the local Express server during development so you
    // never need VITE_API_URL set locally.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
