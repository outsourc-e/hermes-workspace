import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: process.env.HUD_E2E_BASE || 'http://localhost:3000',
    ignoreHTTPSErrors: true,
    storageState: './tests/e2e/.auth-state.json',
  },
})
