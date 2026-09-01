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
    // Vercel Deployment Protection sits in front of every Preview URL — without this header
    // every request just redirects to Vercel's own SSO login wall. Only set against CI/preview
    // runs (see the "Wait for Vercel preview" CI step, which needs the same secret to even
    // detect the deployment is ready); local runs against localhost don't need it.
    ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { extraHTTPHeaders: { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } }
      : {}),
  },
  projects: [
    // Unauthenticated/public-page specs (e.g. login, signup, smoke tests).
    // Depends on "setup" even though these specs are themselves unauthenticated — one case in
    // auth.spec.ts opens its own second, already-logged-in context via a seeded role's
    // storageState file, which only exists once "setup" has run.
    { name: "public", testMatch: /tests\/e2e\/[^/]+\.spec\.ts/, dependencies: ["setup"], use: { ...devices["Desktop Chrome"] } },
    // Logs in as each of the 5 seeded roles once and saves storageState — see auth.setup.ts.
    // fullyParallel: false — 5 concurrent real sign-ins against Supabase Auth
    // can trip its rate limiting (observed as spurious "Invalid email or
    // password" failures under the default 4-worker parallelism), so these
    // run one after another instead.
    { name: "setup", testMatch: /auth\.setup\.ts/, fullyParallel: false },
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
