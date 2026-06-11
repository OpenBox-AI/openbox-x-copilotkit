import { defineConfig, devices } from "@playwright/test";

const appUrl = process.env.APP_URL || "http://localhost:3001";
const agentUrl = process.env.LANGGRAPH_API_URL || process.env.AGENT_URL || "http://localhost:8123";
const useExternalServers =
  process.env.PLAYWRIGHT_USE_EXTERNAL_SERVERS === "true" ||
  Boolean(process.env.APP_URL || process.env.AGENT_URL || process.env.LANGGRAPH_API_URL);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 300_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "artifacts/openbox-e2e-results.json" }],
  ],
  use: {
    baseURL: appUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: useExternalServers
    ? undefined
    : [
        {
          command: "npm run dev:agent",
          url: `${agentUrl.replace(/\/+$/, "")}/ok`,
          reuseExistingServer: true,
          timeout: 180_000,
        },
        {
          command: "AGENT_URL=http://localhost:8123 npm run dev:ui -- -p 3001",
          url: appUrl,
          reuseExistingServer: true,
          timeout: 180_000,
        },
      ],
});
