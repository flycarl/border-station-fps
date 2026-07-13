import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 900 } },
  webServer: { command: 'npm run build && npm run preview', port: 4173, reuseExistingServer: true }
});
