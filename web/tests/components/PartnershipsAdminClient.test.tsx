import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartnershipsAdminClient } from "@/components/PartnershipsAdminClient";
import { makeAuthUser } from "../mocks/fixtures";
import type { PartnershipApplication } from "@/lib/types";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { replace, push } = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));

function makeApplication(overrides: Partial<PartnershipApplication> = {}): PartnershipApplication {
  return {
    id: "prt_1", reference: "CRIC-BRD-2026-000001",
    organisationName: "Zenith Cricket Board", organisationType: "National Cricket Board",
    country: "Australia", region: null, website: null,
    scalePlayers: null, scaleCoaches: null, scaleAcademies: null, scaleRegions: null,
    interests: [], challenges: null, currentSystems: [], timeline: null,
    contactFirstName: "Priya", contactLastName: "Shah", jobTitle: "Head of Cricket",
    email: "priya@zenithcricket.example", phone: null, budgetRange: null, additionalNotes: null,
    status: "submitted", priority: null, ownerId: null, ownerEmail: null,
    createdAt: "2026-09-14T00:00:00Z", updatedAt: "2026-09-14T00:00:00Z",
    ...overrides,
  };
}

describe("PartnershipsAdminClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ applications: [] }) }));
  });

  test("redirects a non-platform-admin away", () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    render(<PartnershipsAdminClient />);
    expect(replace).toHaveBeenCalledWith("/players");
  });

  test("renders an empty state with no applications", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ json: async () => ({ applications: [] }) });

    render(<PartnershipsAdminClient />);
    expect(await screen.findByText("No applications yet.")).toBeInTheDocument();
  });

  test("lists an application with its organisation, contact, status and reference", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ json: async () => ({ applications: [makeApplication()] }) });

    render(<PartnershipsAdminClient />);

    expect(await screen.findByText("Zenith Cricket Board")).toBeInTheDocument();
    expect(screen.getByText("CRIC-BRD-2026-000001")).toBeInTheDocument();
    expect(screen.getByText("Priya Shah")).toBeInTheDocument();
    expect(screen.getByText("Submitted", { selector: "span" })).toBeInTheDocument();
  });

  test("filters by search across organisation, contact, email and reference", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({
        applications: [
          makeApplication(),
          makeApplication({
            id: "prt_2", organisationName: "Other Academy Network", reference: "CRIC-BRD-2026-000002",
            contactFirstName: "Sam", contactLastName: "Lee", email: "sam@otheracademy.example",
          }),
        ],
      }),
    });

    render(<PartnershipsAdminClient />);
    await screen.findByText("Zenith Cricket Board");

    await user.type(screen.getByPlaceholderText(/Search organisation/), "zenith");

    expect(screen.getByText("Zenith Cricket Board")).toBeInTheDocument();
    expect(screen.queryByText("Other Academy Network")).not.toBeInTheDocument();
  });

  test("clicking View on a row navigates to the detail page", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ json: async () => ({ applications: [makeApplication()] }) });

    render(<PartnershipsAdminClient />);
    await screen.findByText("Zenith Cricket Board");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("View"));

    expect(push).toHaveBeenCalledWith("/admin/partnerships/prt_1");
  });
});
