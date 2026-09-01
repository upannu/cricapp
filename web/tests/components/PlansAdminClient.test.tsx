import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlansAdminClient } from "@/components/PlansAdminClient";
import { makeAuthUser } from "../mocks/fixtures";
import type { Plan } from "@/lib/types";

const { fetchAllPlans } = vi.hoisted(() => ({ fetchAllPlans: vi.fn() }));
vi.mock("@/lib/db", () => ({ fetchAllPlans }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const originalFetch = global.fetch;

const PLAN: Plan = {
  id: "plan1", slug: "board-license", name: "Board License", audience: "organization",
  billingType: "subscription", billingInterval: "year", priceAud: 500, pricesByCurrency: {}, seatCap: null,
  accessDurationMonths: null, includedNotes: null, waivesSessionFees: true, platformAdminOnly: false,
  platformFeePercent: 10, active: true, sortOrder: 0,
  sessionsPerMonthLimit: null, chatMessagesPerDayLimit: null, aiReportsEnabled: false,
  marketplaceEnabled: false, locked: false,
};

describe("PlansAdminClient", () => {
  test("renders an empty state with no plans", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAllPlans.mockResolvedValue([]);

    render(<PlansAdminClient />);
    expect(await screen.findByText("No plans yet.")).toBeInTheDocument();
  });

  test("renders a plan with its badges", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAllPlans.mockResolvedValue([PLAN]);

    render(<PlansAdminClient />);

    expect(await screen.findByText("Board License")).toBeInTheDocument();
    expect(screen.getByText("Fees Waived")).toBeInTheDocument();
    expect(screen.getByText("organization")).toBeInTheDocument();
  });

  test("redirects a non-platform-admin away", () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    fetchAllPlans.mockResolvedValue([]);

    render(<PlansAdminClient />);
    expect(replace).toHaveBeenCalledWith("/players");
  });

  test("adding a plan validates required fields before submitting", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAllPlans.mockResolvedValue([]);
    global.fetch = vi.fn() as typeof fetch;

    render(<PlansAdminClient />);
    await user.click(await screen.findByRole("button", { name: "+ New Plan" }));

    // No slug/name/price filled in — save should refuse without hitting the network.
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Slug, name, and a non-negative price are required.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    global.fetch = originalFetch;
  });
});
