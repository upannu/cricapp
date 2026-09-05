import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CoachesClient } from "@/components/CoachesClient";
import { makeAuthUser, makeCoach } from "../mocks/fixtures";

const { fetchCoaches, fetchAcademies, fetchPlayers, fetchActivePlans, upsertCoach } = vi.hoisted(() => ({
  fetchCoaches: vi.fn(), fetchAcademies: vi.fn(), fetchPlayers: vi.fn(), fetchActivePlans: vi.fn(), upsertCoach: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchCoaches, fetchAcademies, fetchPlayers, fetchActivePlans, upsertCoach,
  deleteCoach: vi.fn(), reassignCoachPlayers: vi.fn(), updateAcademyFields: vi.fn(),
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { push, replace, searchParamsGet } = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), searchParamsGet: vi.fn(() => null),
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

  test("scopes the fetch to the academy_admin's own academy", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "academy-9" }) });

    render(<CoachesClient />);

    await screen.findByRole("heading", { name: "Coaches" });
    expect(fetchCoaches).toHaveBeenCalledWith("academy-9");
  });

  test("hides the 'New Coach' button for a coach viewing their own team page", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });

    render(<CoachesClient />);
    await screen.findByRole("heading", { name: "Coaches" });

    expect(screen.queryByRole("button", { name: "+ New Coach" })).not.toBeInTheDocument();
  });

  test("clicking 'Set up payouts' posts to the Connect onboarding endpoint", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", stripeConnectOnboarded: false, stripeConnectAccountId: undefined })]);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://connect.stripe.com/setup/xyz" }) }) as typeof fetch;

    // jsdom doesn't implement navigation — swallow the "Not implemented" assignment.
    Object.defineProperty(window, "location", { value: { ...window.location, href: "" }, writable: true });

    render(<CoachesClient />);
    await user.click(await screen.findByRole("button", { name: "Set up payouts" }));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/stripe/connect/onboard",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ coachId: "c1" }) }),
    );
    global.fetch = originalFetch;
  });

  test("reaches the delete-confirm prompt directly from the row's ⋮ menu, skipping the edit form's own fields", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan" })]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Delete Coach"));

    expect(await screen.findByText("Delete this coach?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm delete" })).toBeInTheDocument();
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
    // "Inactive" also names one of the filter tabs — scope to the card itself, not the whole page.
    const card = screen.getByText("Coach Dan").closest(".bg-surface") as HTMLElement;
    expect(await within(card).findByText("Inactive")).toBeInTheDocument();
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

  test("hides the ⋮ delete menu from a coach viewing their own card", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan" })]);

    render(<CoachesClient />);
    await screen.findByText("Coach Dan");

    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
  });

  test("locks marketplace visibility for a Free independent coach editing their own profile, by default", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c1", name: "Coach Dan", academyId: "", subPlan: "Free" })]);

    render(<CoachesClient />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));

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
    await user.click(await screen.findByRole("button", { name: "Edit" }));

    expect(await screen.findByRole("checkbox", { name: "Visible in the coach marketplace" })).not.toBeDisabled();
    expect(screen.queryByText(/Requires Coach Pro/)).not.toBeInTheDocument();
  });
});
