import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CoachesClient } from "@/components/CoachesClient";
import { makeAcademy, makeAuthUser, makeCoach, makePlayer } from "../mocks/fixtures";

const { fetchCoaches, fetchAcademies, fetchPlayers, fetchActivePlans, upsertCoach, reassignCoachPlayers } = vi.hoisted(() => ({
  fetchCoaches: vi.fn(), fetchAcademies: vi.fn(), fetchPlayers: vi.fn(), fetchActivePlans: vi.fn(),
  upsertCoach: vi.fn(), reassignCoachPlayers: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchCoaches, fetchAcademies, fetchPlayers, fetchActivePlans, upsertCoach, reassignCoachPlayers,
  deleteCoach: vi.fn(), updateAcademyFields: vi.fn(),
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { push, replace, searchParamsGet } = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), searchParamsGet: vi.fn((_key: string) => null as string | null),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => ({ get: searchParamsGet }),
}));

const originalFetch = global.fetch;

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchCoaches.mockResolvedValue([]);
  fetchAcademies.mockResolvedValue([]);
  fetchPlayers.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  upsertCoach.mockClear();
  upsertCoach.mockResolvedValue(undefined);
  reassignCoachPlayers.mockClear();
  reassignCoachPlayers.mockResolvedValue(undefined);
}

describe("CoachesClient", () => {
  test("renders fetched coaches with their payout status", async () => {
    setupDefaults();
    fetchCoaches.mockResolvedValue([
      makeCoach({ id: "c1", name: "Coach Dan", stripeConnectOnboarded: true }),
      makeCoach({ id: "c2", name: "Coach Sam", stripeConnectOnboarded: false, stripeConnectAccountId: undefined }),
    ]);

    render(<CoachesClient />);

    expect(await screen.findByText("Coach Dan")).toBeInTheDocument();
    expect(screen.getByText("Coach Sam")).toBeInTheDocument();
    expect(screen.getByText("✓ Connected")).toBeInTheDocument();
    expect(screen.getByText("Not set up")).toBeInTheDocument();
  });

  test("clicking a coach's name/avatar opens their profile", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan" })]);

    render(<CoachesClient />);
    await user.click(await screen.findByText("Coach Dan"));

    expect(push).toHaveBeenCalledWith("/coaches/c1");
  });

  test("View lives under the row's ⋮ menu and also navigates to the coach's profile", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan" })]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("View"));

    expect(push).toHaveBeenCalledWith("/coaches/c1");
  });

  test("scopes the fetch to the academy_admin's own academy", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "academy-9" }) });

    render(<CoachesClient />);

    await screen.findByRole("heading", { name: "Coaches" });
    expect(fetchCoaches).toHaveBeenCalledWith("academy-9");
  });

  test("hides the 'Add Coach' button for a coach viewing their own team page", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });

    render(<CoachesClient />);
    await screen.findByRole("heading", { name: "Coaches" });

    expect(screen.queryByRole("button", { name: "+ Add Coach" })).not.toBeInTheDocument();
  });

  test("clicking 'Set up payouts' posts to the Connect onboarding endpoint", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", stripeConnectOnboarded: false, stripeConnectAccountId: undefined })]);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://connect.stripe.com/setup/xyz" }) }) as typeof fetch;

    // jsdom doesn't implement navigation — swallow the "Not implemented" assignment.
    Object.defineProperty(window, "location", { value: { ...window.location, href: "" }, writable: true });

    render(<CoachesClient />);
    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Set Up Payouts"));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/stripe/connect/onboard",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ coachId: "c1" }) }),
    );
    global.fetch = originalFetch;
  });

  test("returning from Stripe onboarding actively re-checks status, and updates the row when it's actually done", async () => {
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", stripeConnectOnboarded: false, stripeConnectAccountId: "acct_test123" })]);
    searchParamsGet.mockImplementation((key: string) => (key === "onboarding" ? "return" : key === "coachId" ? "c1" : null));
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ onboarded: true }) }) as typeof fetch;

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/stripe/connect/check-status",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ coachId: "c1" }) }),
    );
    expect(await screen.findByText(/Payout setup complete/)).toBeInTheDocument();
    expect(screen.getByText("✓ Connected")).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/coaches");

    global.fetch = originalFetch;
    searchParamsGet.mockImplementation(() => null);
  });

  test("returning from Stripe onboarding shows the still-incomplete banner when the live check says so", async () => {
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", stripeConnectOnboarded: false, stripeConnectAccountId: "acct_test123" })]);
    searchParamsGet.mockImplementation((key: string) => (key === "onboarding" ? "return" : key === "coachId" ? "c1" : null));
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ onboarded: false }) }) as typeof fetch;

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    expect(await screen.findByText(/hasn't confirmed this account is fully set up/)).toBeInTheDocument();
    expect(screen.getByText("Onboarding incomplete")).toBeInTheDocument();

    global.fetch = originalFetch;
    searchParamsGet.mockImplementation(() => null);
  });

  test("reaches the removal-confirm prompt directly from the row's ⋮ menu, skipping the edit form's own fields", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan" })]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Remove Coach"));

    expect(await screen.findByText("Remove this coach?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm removal" })).toBeInTheDocument();
  });

  test("removing a coach with no dependents soft-deletes — sets login_disabled, never actually deletes the row", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan" })]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Remove Coach"));
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));

    expect(upsertCoach).toHaveBeenCalledWith(expect.objectContaining({ id: "c1", login_disabled: true, disabled_reason: "Removed by staff via Coaches page" }));
    // Immediately drops out of the default "All" view (excludes Removed) — but the row itself
    // was never deleted, just flagged; see the Removed-tab test below for where it went.
    expect(screen.queryByText("Coach Dan")).not.toBeInTheDocument();
  });

  test("a removed coach shows under the Removed filter with a Reinstate action, and nothing else", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({
      id: "c1", name: "Coach Dan", loginDisabled: true, disabledAt: "2026-01-01T00:00:00.000Z", disabledReason: "Left the academy",
    })]);

    render(<CoachesClient />);
    expect(await screen.findByText("No coaches found.")).toBeInTheDocument();
    expect(screen.queryByText("Coach Dan")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Removed/ }));
    expect(await screen.findByText("Coach Dan")).toBeInTheDocument();
    expect(screen.getByText("Left the academy · 01 Jan 2026")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByText("Reinstate Coach")).toBeInTheDocument();
    expect(screen.queryByText("Deactivate")).not.toBeInTheDocument();
    expect(screen.queryByText("Remove Coach")).not.toBeInTheDocument();
  });

  test("reinstating a removed coach requires confirmation, then restores their login", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", loginDisabled: true })]);
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true })));

    render(<CoachesClient />);
    await user.click(await screen.findByRole("button", { name: /^Removed/ }));
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Reinstate Coach"));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await screen.findByText("Reinstate Coach?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yes, Reinstate" }));
    expect(fetchSpy).toHaveBeenCalledWith("/api/reactivate-coach", expect.objectContaining({
      method: "POST", body: JSON.stringify({ coachId: "c1" }),
    }));

    // Clicking the already-active Removed card again clears the filter back to "All".
    await user.click(screen.getByRole("button", { name: /^Removed/ }));
    expect(await screen.findByText("Coach Dan")).toBeInTheDocument();

    fetchSpy.mockRestore();
  });

  test("deactivating a coach requires confirmation before it actually happens", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", status: "Active" })]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Deactivate"));

    // Not applied yet — still just a confirm prompt.
    expect(upsertCoach).not.toHaveBeenCalled();
    expect(await screen.findByText("Deactivate Coach?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yes, Deactivate" }));
    expect(upsertCoach).toHaveBeenCalledWith({ id: "c1", status: "Inactive" });
    // "Inactive" also names one of the stat cards — scope to the table's own card, not the page.
    const card = screen.getByText("Coach Dan").closest(".bg-surface") as HTMLElement;
    expect(await within(card).findByText("Inactive")).toBeInTheDocument();
  });

  test("a failed deactivate shows the real error inside the still-open confirm dialog, not silently", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", status: "Active" })]);
    upsertCoach.mockRejectedValueOnce(new Error("Row-level security denied this update."));

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Deactivate"));
    await user.click(screen.getByRole("button", { name: "Yes, Deactivate" }));

    // The dialog itself is where this error must show — a row-triggered confirm has no edit form
    // open anywhere on the page for a page-level error message to land in instead.
    expect(await screen.findByText("Row-level security denied this update.")).toBeInTheDocument();
    expect(screen.getByText("Deactivate Coach?")).toBeInTheDocument();
    // Never applied — the coach's own status badge is untouched.
    const card = screen.getByText("Coach Dan").closest(".bg-surface") as HTMLElement;
    expect(within(card).getByText("Active")).toBeInTheDocument();
  });

  test("cancelling the deactivate confirm leaves the coach untouched", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", status: "Active" })]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Deactivate"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Deactivate Coach?")).not.toBeInTheDocument();
    expect(upsertCoach).not.toHaveBeenCalled();
  });

  test("toggling marketplace visibility also requires confirmation first", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", marketplaceVisible: false })]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Show in Marketplace"));

    expect(await screen.findByText("Show in Marketplace?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes, Show" }));

    expect(upsertCoach).toHaveBeenCalledWith({ id: "c1", marketplace_visible: true });
  });

  test("offers Reassign All Players only when the coach actually has players, and requires confirmation", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([
      makeCoach({ id: "c1", name: "Coach Dan" }),
      makeCoach({ id: "c2", name: "Coach Sam" }),
    ]);
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", name: "Alice", coachId: "c1" }),
      makePlayer({ id: "p2", name: "Bob", coachId: "c1" }),
    ]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    const [coach1Menu] = screen.getAllByRole("button", { name: "More actions" });
    await user.click(coach1Menu);
    await user.click(screen.getByText("Reassign All Players"));

    expect(reassignCoachPlayers).not.toHaveBeenCalled();
    expect(await screen.findByText("Reassign All Players?")).toBeInTheDocument();
    expect(screen.getByText(/2 players currently assigned to "Coach Dan"/)).toBeInTheDocument();

    await user.selectOptions(screen.getByDisplayValue("— Leave unassigned —"), "Coach Sam");
    await user.click(screen.getByRole("button", { name: "Reassign" }));

    expect(reassignCoachPlayers).toHaveBeenCalledWith("c1", "c2");
  });

  test("hides Reassign All Players from a coach with no players assigned", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan" })]);
    fetchPlayers.mockResolvedValue([]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.queryByText("Reassign All Players")).not.toBeInTheDocument();
  });

  test("cancelling Reassign All Players calls nothing", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan" })]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice", coachId: "c1" })]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Reassign All Players"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Reassign All Players?")).not.toBeInTheDocument();
    expect(reassignCoachPlayers).not.toHaveBeenCalled();
  });

  test("resending an invite requires confirmation, then shows a sent indicator", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", email: "dan@example.com" })]);
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true })));

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Resend Invite"));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await screen.findByText("Resend Invite?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yes, Resend" }));
    expect(fetchSpy).toHaveBeenCalledWith("/api/resend-coach-invite", expect.objectContaining({
      method: "POST", body: JSON.stringify({ coachId: "c1" }),
    }));
    expect(await screen.findByText("✓ Invite sent")).toBeInTheDocument();

    fetchSpy.mockRestore();
  });

  test("hides Resend Invite for a coach with no email on file", async () => {
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", email: "" })]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");
    // No ⋮ items left to trigger it, but the button itself still renders (Deactivate/Delete
    // always apply) — check the item specifically isn't offered.
    await userEvent.setup().click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.queryByText("Resend Invite")).not.toBeInTheDocument();
  });

  test("a coach viewing their own row only gets Edit/Payouts in the ⋮ menu, never the staff-only actions", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan" })]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Set Up Payouts")).toBeInTheDocument();
    expect(screen.queryByText("Deactivate")).not.toBeInTheDocument();
    expect(screen.queryByText("Remove Coach")).not.toBeInTheDocument();
  });

  test("hides the ⋮ menu entirely from a coach viewing another coach's row", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c2", name: "Coach Sam" })]);

    render(<CoachesClient />);
    await screen.findByText("Coach Sam");

    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
  });

  test("locks marketplace visibility for a Free independent coach editing their own profile, by default", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", academyId: "", subPlan: "Free" })]);

    render(<CoachesClient />);
    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Edit"));

    expect(await screen.findByText(/Requires Coach Pro/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Visible in the coach marketplace" })).toBeDisabled();
  });

  test("unlocks marketplace visibility for a Free coach when the Plan Catalog's coach-free row enables it", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", academyId: "", subPlan: "Free" })]);
    // canUseMarketplaceForCoach reads this catalog row rather than hardcoding subPlan === "Coach
    // Pro" — an admin enabling marketplaceEnabled on coach-free should actually unlock this,
    // proving the fix reads the catalog instead of ignoring it.
    fetchActivePlans.mockResolvedValue([{
      id: "coach-free-plan", slug: "coach-free", name: "Coach Free", audience: "individual",
      billingType: "subscription", billingInterval: "month", priceAud: 0, pricesByCurrency: {},
      seatCap: 5, accessDurationMonths: null, includedNotes: null, waivesSessionFees: false,
      platformAdminOnly: false, platformFeePercent: 10, active: true, sortOrder: -11,
      sessionsPerMonthLimit: null, chatMessagesPerDayLimit: null, aiReportsEnabled: false,
      marketplaceEnabled: true, locked: true,
    }]);

    render(<CoachesClient />);
    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Edit"));

    expect(await screen.findByRole("checkbox", { name: "Visible in the coach marketplace" })).not.toBeDisabled();
    expect(screen.queryByText(/Requires Coach Pro/)).not.toBeInTheDocument();
  });

  test("lets a platform_admin save a new coach with no academy assigned (independent Coach Pro coach)", async () => {
    const user = userEvent.setup();
    setupDefaults();

    render(<CoachesClient />);
    await user.click(await screen.findByRole("button", { name: "+ Add Coach" }));

    await user.type(screen.getByPlaceholderText("e.g. Arjun Sharma"), "Priya Iyer");
    await user.type(screen.getByPlaceholderText("coach@email.com"), "priya@example.com");
    // Skip the invite email so the save doesn't also need a fetch mock — irrelevant to this fix.
    await user.click(screen.getByRole("checkbox", { name: /Send login invite email/ }));
    // Academy field is deliberately left on its default "— None (independent coach) —" option.

    await user.click(screen.getByRole("button", { name: "Create Coach" }));

    // The old blanket "Please assign this coach to an academy." validation must not appear —
    // an independent Coach Pro coach with no academy is a legitimate, supported state.
    expect(screen.queryByText("Please assign this coach to an academy.")).not.toBeInTheDocument();
    await screen.findByText("Priya Iyer");
    expect(upsertCoach).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Priya Iyer", academy_id: null }),
    );
  });

  test("searches coaches by name or email", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([
      makeCoach({ id: "c1", name: "Coach Dan", email: "dan@example.com" }),
      makeCoach({ id: "c2", name: "Coach Sam", email: "sam@riverside.example.com" }),
    ]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    await user.type(screen.getByPlaceholderText(/Search coaches/), "riverside");
    expect(await screen.findByText("Coach Sam")).toBeInTheDocument();
    expect(screen.queryByText("Coach Dan")).not.toBeInTheDocument();
  });

  test("clicking the Players column header sorts by player count", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([
      makeCoach({ id: "c1", name: "Coach Ant" }),
      makeCoach({ id: "c2", name: "Coach Zed" }),
    ]);
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", coachId: "c2" }),
      makePlayer({ id: "p2", coachId: "c2" }),
    ]);

    render(<CoachesClient />);
    await screen.findByText("Coach Ant");

    const rowNames = () => screen.getAllByRole("row").slice(1).map((r) => r.textContent);
    // Default sort is by name ascending — Ant before Zed.
    expect(rowNames()[0]).toContain("Coach Ant");

    const playersHeader = screen.getByRole("columnheader", { name: /Players/ });
    await user.click(within(playersHeader).getByRole("button"));
    // Ascending by count — Ant (0 players) before Zed (2).
    expect(rowNames()[0]).toContain("Coach Ant");

    await user.click(within(playersHeader).getByRole("button"));
    // Descending — Zed (2 players) now first.
    expect(rowNames()[0]).toContain("Coach Zed");
  });

  test("clicking the Active stat card filters the list, and clicking it again clears back to All", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([
      makeCoach({ id: "c1", name: "Coach Dan", status: "Active" }),
      makeCoach({ id: "c2", name: "Coach Sam", status: "Inactive" }),
    ]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    // The card's own accessible name is "Active <count>" (label then value) — anchored rather
    // than exact.
    await user.click(screen.getByRole("button", { name: /^Active/ }));
    expect(screen.getByText("Coach Dan")).toBeInTheDocument();
    expect(screen.queryByText("Coach Sam")).not.toBeInTheDocument();

    // Same toggle Players' own stat-card filtering already has — a second click un-narrows it.
    await user.click(screen.getByRole("button", { name: /^Active/ }));
    expect(screen.getByText("Coach Dan")).toBeInTheDocument();
    expect(screen.getByText("Coach Sam")).toBeInTheDocument();
  });

  test("clicking the Inactive stat card filters the list to Inactive coaches", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([
      makeCoach({ id: "c1", name: "Coach Dan", status: "Active" }),
      makeCoach({ id: "c2", name: "Coach Sam", status: "Inactive" }),
    ]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: /^Inactive/ }));
    expect(screen.getByText("Coach Sam")).toBeInTheDocument();
    expect(screen.queryByText("Coach Dan")).not.toBeInTheDocument();
  });

  test("'Total coaches' is a plain metric, not a filter — it renders no button at all", async () => {
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", status: "Active" })]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    expect(screen.queryByRole("button", { name: /^Total coaches/ })).not.toBeInTheDocument();
  });

  test("filters coaches by academy via the pill, including the Independent bucket, and Reset filters clears it", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([
      makeCoach({ id: "c1", name: "Coach Dan", academyId: "a1" }),
      makeCoach({ id: "c2", name: "Coach Sam", academyId: "" }),
    ]);
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "a1", name: "Riverside Academy" })]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "Academy" }));
    await user.click(screen.getByRole("option", { name: "Riverside Academy" }));
    expect(screen.getByText("Coach Dan")).toBeInTheDocument();
    expect(screen.queryByText("Coach Sam")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Academy" }));
    await user.click(screen.getByRole("option", { name: "Independent" }));
    expect(screen.getByText("Coach Sam")).toBeInTheDocument();
    expect(screen.queryByText("Coach Dan")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByText("Coach Dan")).toBeInTheDocument();
    expect(screen.getByText("Coach Sam")).toBeInTheDocument();
  });

  test("filters coaches by payout status via the pill", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([
      makeCoach({ id: "c1", name: "Coach Dan", stripeConnectOnboarded: true, stripeConnectAccountId: "acct_1" }),
      makeCoach({ id: "c2", name: "Coach Sam", stripeConnectOnboarded: false, stripeConnectAccountId: undefined }),
    ]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "Payouts" }));
    await user.click(screen.getByRole("option", { name: "Connected" }));
    expect(screen.getByText("Coach Dan")).toBeInTheDocument();
    expect(screen.queryByText("Coach Sam")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Payouts" }));
    await user.click(screen.getByRole("option", { name: "Not set up" }));
    expect(screen.getByText("Coach Sam")).toBeInTheDocument();
    expect(screen.queryByText("Coach Dan")).not.toBeInTheDocument();
  });

  test("shows a Marketplace badge only for a coach currently visible in the marketplace", async () => {
    setupDefaults();
    fetchCoaches.mockResolvedValue([
      makeCoach({ id: "c1", name: "Coach Dan", marketplaceVisible: true }),
      makeCoach({ id: "c2", name: "Coach Sam", marketplaceVisible: false }),
    ]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    const danRow = screen.getByText("Coach Dan").closest("button") as HTMLElement;
    const samRow = screen.getByText("Coach Sam").closest("button") as HTMLElement;
    expect(within(danRow).getByText("Marketplace")).toBeInTheDocument();
    expect(within(samRow).queryByText("Marketplace")).not.toBeInTheDocument();
  });

  test("shows the coach's academy in its own column, or 'Independent' when they have none", async () => {
    setupDefaults();
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "Riverside Academy" })]);
    fetchCoaches.mockResolvedValue([
      makeCoach({ id: "c1", name: "Coach Dan", academyId: "ac1" }),
      makeCoach({ id: "c2", name: "Coach Sam", academyId: "" }),
    ]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    expect(screen.getByText(/Riverside Academy/)).toBeInTheDocument();
    expect(screen.getByText("Independent")).toBeInTheDocument();
  });

  test("paginates the table at 10 coaches per page", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => makeCoach({ id: `c${i + 1}`, name: `Coach ${String(i + 1).padStart(2, "0")}` })),
    );

    render(<CoachesClient />);
    await screen.findByText("Coach 01");

    // A single count at the foot of the table, matching Players — not a standalone heading whose
    // position depends on whether a pagination footer exists to hold it (see PR #75).
    expect(screen.getByText("Showing 1–10 of 12")).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ Coach(es)?$/)).not.toBeInTheDocument();

    expect(screen.getByText("Coach 10")).toBeInTheDocument();
    expect(screen.queryByText("Coach 11")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "← Prev" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next →" }));

    expect(await screen.findByText("Coach 11")).toBeInTheDocument();
    expect(screen.getByText("Coach 12")).toBeInTheDocument();
    expect(screen.queryByText("Coach 01")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next →" })).toBeDisabled();
  });

  test("shows no pagination controls at 10 coaches or fewer", async () => {
    setupDefaults();
    fetchCoaches.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => makeCoach({ id: `c${i + 1}`, name: `Coach ${String(i + 1).padStart(2, "0")}` })),
    );

    render(<CoachesClient />);
    await screen.findByText("Coach 10");
    expect(screen.getByText("Showing 1–10 of 10")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  test("changing rows per page shows more coaches on one page", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => makeCoach({ id: `c${i + 1}`, name: `Coach ${String(i + 1).padStart(2, "0")}` })),
    );

    render(<CoachesClient />);
    await screen.findByText("Coach 01");
    expect(screen.queryByText("Coach 12")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Rows per page"), "25");

    expect(await screen.findByText("Coach 12")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–12 of 12")).toBeInTheDocument();
  });
});
