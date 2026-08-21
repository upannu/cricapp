import { test as setup } from "@playwright/test";
import path from "node:path";
import { ROLE_FIXTURES } from "../seed/fixtures";

const E2E_TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "E2E-test-password-1234!";
const authDir = path.resolve(__dirname, ".auth");

// Logs in as each seeded role via the real /login form (not hand-crafted
// cookies — avoids coupling to @supabase/ssr's internal cookie format) and
// saves the resulting session as Playwright storageState. Downstream spec
// projects depend on this "setup" project and reuse the saved state, so
// there's no per-test login. Requires `npm run seed` to have been run first
// against the same Supabase project this test run points at.
for (const fixture of ROLE_FIXTURES) {
  setup(`authenticate as ${fixture.role}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("your@email.com").fill(fixture.email);
    await page.getByPlaceholder("••••••••").fill(E2E_TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/players", { timeout: 15_000 });
    await page.context().storageState({ path: path.join(authDir, `${fixture.role}.json`) });
  });
}
