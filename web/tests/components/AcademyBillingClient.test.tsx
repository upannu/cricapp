import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AcademyBillingClient } from "@/components/AcademyBillingClient";
import { makeAcademy, makeAuthUser } from "../mocks/fixtures";
import type { Plan } from "@/lib/types";

const { fetchActivePlans } = vi.hoisted(() => ({ fetchActivePlans: vi.fn() }));
vi.mock("@/lib/db", () => ({ fetchActivePlans }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

vi.mock("@/components/InvoiceHistoryList", () => ({ InvoiceHistoryList: () => <div data-testid="invoice-history" /> }));

const originalFetch = global.fetch;

const ORG_PLAN: Plan = {
  id: "plan1", slug: "board-license", name: "Board License", audience: "organization",
  billingType: "subscription", billingInterval: "year", priceAud: 500, pricesByCurrency: {}, seatCap: 50,
  accessDurationMonths: null, includedNotes: null, waivesSessionFees: false, platformAdminOnly: false,
  platformFeePercent: 10, active: true, sortOrder: 0,
  sessionsPerMonthLimit: null, chatMessagesPerDayLimit: null, aiReportsEnabled: false,
  marketplaceEnabled: false, locked: false,
};

describe("AcademyBillingClient", () => {
  test("shows 'Not available' for a caller without billing access", () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    fetchActivePlans.mockResolvedValue([]);

    render(<AcademyBillingClient academy={makeAcademy({ id: "ac1" })} />);

    expect(screen.getByText("Not available")).toBeInTheDocument();
  });

  test("academy_admin of the same academy can view plans and subscribe", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    fetchActivePlans.mockResolvedValue([ORG_PLAN]);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://checkout.stripe.com/xyz" }) }) as typeof fetch;
    Object.defineProperty(window, "location", { value: { ...window.location, href: "" }, writable: true });

    render(<AcademyBillingClient academy={makeAcademy({ id: "ac1", planId: undefined })} />);

    expect(await screen.findByText("Board License")).toBeInTheDocument();
    expect(screen.getByText("No active license — choose a plan below.")).toBeInTheDocument();

    await user.click(screen.getByText("Board License"));
    await user.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/stripe/create-academy-checkout-session",
      expect.objectContaining({ body: JSON.stringify({ academyId: "ac1", planId: "plan1" }) }),
    );
    global.fetch = originalFetch;
  });

  test("shows Manage Billing (not Subscribe) once the academy has an active subscription", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchActivePlans.mockResolvedValue([ORG_PLAN]);

    render(<AcademyBillingClient academy={makeAcademy({ id: "ac1", planId: "plan1", subscriptionStatus: "active", playerIds: ["p1", "p2"] })} />);

    expect(await screen.findByRole("button", { name: "Manage Billing" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subscribe" })).not.toBeInTheDocument();
    expect(screen.getByText("2 / 50 bowlers assigned")).toBeInTheDocument();
  });
});
