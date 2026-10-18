import { test, expect } from "@playwright/test";

// Regression guard for a real bug: the homepage's role CTAs (Player/Coach/Organisation, in both
// the "Choose Your Route" cards and the final "Get Started" strip) and five other homepage CTAs
// all originally pointed at a bare href="#" placeholder left over from the Figma Make import —
// they looked real but did nothing. Two links are deliberately left unfixed (the "CRIC HQ
// Insights" section's fabricated blog posts have no real page to send visitors to) and are not
// covered here.
test.describe("Homepage CTA links", () => {
  test("the three role CTAs (Player/Coach/Organisation) are wired correctly in both places they appear", async ({ page }) => {
    await page.goto("/");

    const playerLinks = page.getByRole("link", { name: /CLAIM YOUR CRICKET PASSPORT/i });
    await expect(playerLinks).toHaveCount(2);
    await expect(playerLinks.nth(0)).toHaveAttribute("href", "#player-passport");
    await expect(playerLinks.nth(1)).toHaveAttribute("href", "#player-passport");

    const coachLinks = page.getByRole("link", { name: /STREAMLINE YOUR SQUAD/i });
    await expect(coachLinks).toHaveCount(2);
    await expect(coachLinks.nth(0)).toHaveAttribute("href", "/organisations/coaches");
    await expect(coachLinks.nth(1)).toHaveAttribute("href", "/organisations/coaches");

    const orgLinks = page.getByRole("link", { name: /DIGITISE YOUR ASSOCIATION/i });
    await expect(orgLinks).toHaveCount(2);
    await expect(orgLinks.nth(0)).toHaveAttribute("href", "/organisations");
    await expect(orgLinks.nth(1)).toHaveAttribute("href", "/organisations");
  });

  test("the five other homepage CTAs are wired correctly", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "BUILD YOUR CRICKET PROFILE" })).toHaveAttribute("href", "/signup");
    await expect(page.getByRole("link", { name: "SCORE YOUR NEXT MATCH" })).toHaveAttribute("href", "/signup");
    await expect(page.getByRole("link", { name: "EXPLORE COMPETITIONS" })).toHaveAttribute("href", "/signup");
    await expect(page.getByRole("link", { name: "EXPLORE COACHING" })).toHaveAttribute("href", "/organisations/coaches");
    await expect(page.getByRole("link", { name: "PARTNER WITH CRIC HQ" })).toHaveAttribute("href", "/organisations");
  });

  test("Claim Your Cricket Passport scrolls to the on-page Player Passport section instead of navigating away", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /CLAIM YOUR CRICKET PASSPORT/i }).first().click();

    await expect(page).toHaveURL(/#player-passport$/);
    await expect(page.locator("#player-passport")).toBeInViewport();
    await expect(page.getByText("Player Cricket Passport")).toBeVisible();
  });

  test("Streamline Your Squad navigates to the Coaches landing page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /STREAMLINE YOUR SQUAD/i }).first().click();

    await expect(page).toHaveURL(/\/organisations\/coaches$/);
    await expect(page.getByRole("heading", { name: "CRIC HQ for Coaches" })).toBeVisible();
  });

  test("Digitise Your Association navigates to the Organisations hub", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /DIGITISE YOUR ASSOCIATION/i }).first().click();

    await expect(page).toHaveURL(/\/organisations$/);
    await expect(page.getByRole("heading", { name: "CRIC HQ for Organisations" })).toBeVisible();
  });

  test("Build Your Cricket Profile navigates to signup", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "BUILD YOUR CRICKET PROFILE" }).click();

    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  });

  test("Score Your Next Match navigates to signup", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "SCORE YOUR NEXT MATCH" }).click();

    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  });

  test("Explore Competitions navigates to signup", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "EXPLORE COMPETITIONS" }).click();

    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  });
});
