import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PartnershipDetailClient } from "@/components/PartnershipDetailClient";
import { makeAuthUser } from "../mocks/fixtures";
import type { PartnershipApplication, PartnershipActivityEntry } from "@/lib/types";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const APPLICATION: PartnershipApplication = {
  id: "prt_1", reference: "CRIC-BRD-2026-000001",
  organisationName: "Zenith Cricket Board", organisationType: "National Cricket Board",
  country: "Australia", region: "Victoria", website: "https://zenithcricket.example",
  scalePlayers: "1,001–5,000", scaleCoaches: "51–100", scaleAcademies: "6–20", scaleRegions: "2–5",
  interests: ["player_development", "ai_video_analysis"], challenges: "Fragmented systems across regions.",
  currentSystems: ["Spreadsheets"], timeline: "Within 3 Months",
  contactFirstName: "Priya", contactLastName: "Shah", jobTitle: "Head of Cricket",
  email: "priya@zenithcricket.example", phone: "0412345678", budgetRange: "$100,000–$250,000",
  additionalNotes: "Keen to move quickly.",
  status: "under_review", priority: "High", ownerId: null, ownerEmail: null,
  createdAt: "2026-09-14T00:00:00Z", updatedAt: "2026-09-14T00:00:00Z",
};

const ACTIVITY: PartnershipActivityEntry[] = [
  { id: "pact_1", applicationId: "prt_1", kind: "submitted", body: "Application submitted via the public partnership form.", fromStatus: null, toStatus: null, createdBy: "system", createdAt: "2026-09-14T00:00:00Z" },
];

describe("PartnershipDetailClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ error: "unused default" }) }));
  });

  test("redirects a non-platform-admin away", () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    render(<PartnershipDetailClient id="prt_1" />);
    expect(replace).toHaveBeenCalledWith("/players");
  });

  test("renders the full application detail and activity feed", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ application: APPLICATION, activity: ACTIVITY }),
    });

    render(<PartnershipDetailClient id="prt_1" />);

    expect(await screen.findByRole("heading", { name: "Zenith Cricket Board" })).toBeInTheDocument();
    expect(screen.getByText(/CRIC-BRD-2026-000001/)).toBeInTheDocument();
    expect(screen.getByText("Under Review")).toBeInTheDocument();
    expect(screen.getByText("Australia, Victoria")).toBeInTheDocument();
    expect(screen.getByText("Fragmented systems across regions.")).toBeInTheDocument();
    expect(screen.getByText("Priya Shah")).toBeInTheDocument();
    expect(screen.getByText("Application submitted")).toBeInTheDocument();
  });

  test("shows the load error when the fetch fails", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ json: async () => ({ error: "Application not found." }) });

    render(<PartnershipDetailClient id="bogus" />);
    expect(await screen.findByText("Application not found.")).toBeInTheDocument();
  });
});
