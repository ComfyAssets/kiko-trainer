import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Port configuration - can be set via environment variable
const UI_PORT = process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 3333;
const API_PORT = process.env.VITE_API_PORT ? parseInt(process.env.VITE_API_PORT) : 8888;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: UI_PORT,
    host: true, // Listen on all addresses
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api'),
      },
    },
  },
})