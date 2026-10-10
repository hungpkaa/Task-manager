import { defineConfig } from '@playwright/test';

const baseURL = process.env.WEB_URL || 'http://127.0.0.1:5174';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: '.local/e2e-results',
  reporter: [['list'], ['html', { outputFolder: '.local/e2e-report', open: 'never' }]],
  webServer: process.env.WEB_URL ? undefined : [
    { command: 'npm.cmd run dev -w @task-manager/api', url: 'http://127.0.0.1:4011/api/health/ready', env: { PORT: '4011', APP_ORIGIN: baseURL }, reuseExistingServer: false, timeout: 60_000 },
    { command: 'npm.cmd run dev -w @task-manager/web -- --port 5174', url: baseURL, env: { API_PROXY_TARGET: 'http://127.0.0.1:4011' }, reuseExistingServer: false, timeout: 60_000 },
  ],
  use: {
    baseURL,
    channel: process.env.E2E_BROWSER_CHANNEL || 'msedge',
    headless: true,
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
});
