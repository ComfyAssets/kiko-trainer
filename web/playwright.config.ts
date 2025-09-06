import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:5173',
    headless: true,
  },
  webServer: {
    command: 'vite --port 5173 --host 127.0.0.1',
    port: 5173,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
