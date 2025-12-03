import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['factory.universalhex.org', 'localhost', '127.0.0.1'],
    proxy: {
      '/static': {
        target: 'http://127.0.0.1:8100',
        changeOrigin: true,
      },
    },
  },
})
