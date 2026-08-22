import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end coverage.
 *
 * Runs against a real stack: the web app, the worker and the preview origin.
 * The RTL and viewport projects exist because Arabic and Urdu layout
 * regressions are invisible in an English-only run.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-ar', use: { ...devices['Desktop Chrome'], locale: 'ar' } },
    { name: 'desktop-en', use: { ...devices['Desktop Chrome'], locale: 'en' } },
    { name: 'tablet-ur', use: { ...devices['iPad Mini'], locale: 'ur' } },
    { name: 'mobile-ar', use: { ...devices['Pixel 7'], locale: 'ar' } },
  ],
});
