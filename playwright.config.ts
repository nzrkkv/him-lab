/**
 * e2e: собранный сайт (тестовая сборка с мгновенными эффектами) открывается локальным сервером.
 * Локально в среде агента используется Chrome из /usr/bin/google-chrome (CHROME_PATH), в CI — Chromium Playwright.
 */
import { defineConfig, devices } from 'playwright/test';

const chrome = process.env['CHROME_PATH'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
    ...(chrome ? { launchOptions: { executablePath: chrome } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'tablet-landscape',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 }, hasTouch: true },
    },
    {
      name: 'tablet-portrait',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true },
    },
  ],
  webServer: {
    command: 'CHANNEL=test FX_INSTANT=1 npx tsx scripts/build.ts && npx tsx scripts/serve.ts dist',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
