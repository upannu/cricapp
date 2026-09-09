import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditCoachForm } from "@/components/EditCoachForm";
import { makeAuthUser, makeCoach } from "../mocks/fixtures";

const { fetchCoaches, fetchAcademies, fetchActivePlans, upsertCoach } = vi.hoisted(() => ({
  fetchCoaches: vi.fn(), fetchAcademies: vi.fn(), fetchActivePlans: vi.fn(), upsertCoach: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ fetchCoaches, fetchAcademies, fetchActivePlans, upsertCoach }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchCoaches.mockResolvedValue([]);
  fetchAcademies.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  upsertCoach.mockClear();
  upsertCoach.mockResolvedValue(undefined);
  push.mockClear();
}

describe("EditCoachForm", () => {
  test("pre-fills fields from the coach and saves edits, then redirects to their profile", async () => {
    const user = userEvent.setup();
    setupDefaults();
    const coach = makeCoach({ id: "c1", name: "Coach Dan", email: "dan@example.com" });

    render(<EditCoachForm coach={coach} />);

    const nameInput = screen.getByDisplayValue("Coach Dan");
    await user.clear(nameInput);
    await user.type(nameInput, "Daniel Coach");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(upsertCoach).toHaveBeenCalledWith(expect.objectContaining({ id: "c1", name: "Daniel Coach", email: "dan@example.com" }));
    expect(await screen.findByRole("button", { name: "✓ Saved" })).toBeInTheDocument();

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/coaches/c1"), { timeout: 2000 });
  });

  test("blocks the save when another coach already uses the entered email", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchCoaches.mockResolvedValue([makeCoach({ id: "c2", name: "Coach Sam", email: "sam@example.com" })]);
    const coach = makeCoach({ id: "c1", name: "Coach Dan", email: "dan@example.com" });

    render(<EditCoachForm coach={coach} />);
    await screen.findByDisplayValue("Coach Dan");

    const emailInput = screen.getByDisplayValue("dan@example.com");
    await user.clear(emailInput);
    await user.type(emailInput, "sam@example.com");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByText(/already uses sam@example.com/)).toBeInTheDocument();
    expect(upsertCoach).not.toHaveBeenCalled();
  });

  test("locks marketplace visibility for a Free independent coach editing their own profile, by default", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    const coach = makeCoach({ id: "c1", name: "Coach Dan", academyId: "", subPlan: "Free", marketplaceVisible: false });

    render(<EditCoachForm coach={coach} />);

    expect(await screen.findByText(/Requires Coach Pro/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Visible in the coach marketplace" })).toBeDisabled();
  });

  test("unlocks marketplace visibility for a Free coach when the Plan Catalog's coach-free row enables it", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    const coach = makeCoach({ id: "c1", name: "Coach Dan", academyId: "", subPlan: "Free", marketplaceVisible: false });
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

    render(<EditCoachForm coach={coach} />);

    expect(await screen.findByRole("checkbox", { name: "Visible in the coach marketplace" })).not.toBeDisabled();
    expect(screen.queryByText(/Requires Coach Pro/)).not.toBeInTheDocument();
  });

  test("disables the Email field for a coach editing their own profile", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    const coach = makeCoach({ id: "c1", name: "Coach Dan", email: "dan@example.com" });

    render(<EditCoachForm coach={coach} />);
    await screen.findByDisplayValue("Coach Dan");

    expect(screen.getByDisplayValue("dan@example.com")).toBeDisabled();
  });

  test("Cancel links back to the coach's own profile", async () => {
    setupDefaults();
    const coach = makeCoach({ id: "c1", name: "Coach Dan" });

    render(<EditCoachForm coach={coach} />);
    await screen.findByDisplayValue("Coach Dan");

    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/coaches/c1");
  });
});
