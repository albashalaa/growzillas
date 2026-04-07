import { defineConfig, devices } from '@playwright/test';

// Must match dev CORS in apps/api (defaults to http://localhost:3000 only).
const webBase = process.env.PLAYWRIGHT_WEB_BASE_URL || 'http://localhost:3000';
const apiBase = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:3002';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 90_000,
  use: {
    baseURL: webBase,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
    // Use locally installed Google Chrome (no Playwright Chromium download required).
    channel: 'chrome',
  },
  webServer: [
    {
      command: 'pnpm -C apps/api start:dev',
      url: apiBase,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm -C apps/web dev',
      url: webBase,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: apiBase,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
