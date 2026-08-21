import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    // Unauthenticated/public-page specs (e.g. login, signup, smoke tests).
    { name: "public", testMatch: /tests\/e2e\/[^/]+\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    // Logs in as each of the 5 seeded roles once and saves storageState — see auth.setup.ts.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // Role-scoped specs live under tests/e2e/roles/<role>/*.spec.ts and reuse that role's
    // saved session — no per-test login. Empty until a batch adds specs there.
    ...(["platform_admin", "academy_admin", "coach", "player", "parent"] as const).map((role) => ({
      name: role,
      testDir: `./tests/e2e/roles/${role}`,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: `tests/e2e/.auth/${role}.json` },
    })),
  ],
  // Against CI/preview runs PLAYWRIGHT_BASE_URL is set to the deployed URL and no
  // local server is needed; for local runs, spin up the dev server automatically.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
