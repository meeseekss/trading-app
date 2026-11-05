import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4174',
    serviceWorkers: 'block', // Tests sollen immer die aktuellen Dateien sehen
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'python3 -m http.server 4174',
    url: 'http://localhost:4174',
    reuseExistingServer: true,
  },
});
