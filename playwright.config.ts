import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 8_000
  },
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: "./apps/api/node_modules/.bin/tsc -p apps/api/tsconfig.json && node apps/api/dist/server.js",
      url: "http://127.0.0.1:4000/healthz",
      reuseExistingServer: true,
      timeout: 20_000
    },
    {
      command: "./apps/web/node_modules/.bin/vite --host 127.0.0.1 --port 3000 apps/web",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: true,
      timeout: 20_000
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
