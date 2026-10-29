import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4173/h112/', headless: true },
  webServer: {
    env: { VITE_BASE_PATH: '/h112/' },
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://127.0.0.1:4173/h112/',
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
      },
    },
  ],
});
