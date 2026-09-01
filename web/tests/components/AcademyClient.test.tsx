import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AcademyClient } from "@/components/AcademyClient";
import { makeAcademy, makeAuthUser } from "../mocks/fixtures";

const { fetchAcademies, fetchPlayers, fetchCoaches, fetchActivePlans, fetchNets } = vi.hoisted(() => ({
  fetchAcademies: vi.fn(), fetchPlayers: vi.fn(), fetchCoaches: vi.fn(), fetchActivePlans: vi.fn(), fetchNets: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchAcademies, fetchPlayers, fetchCoaches, fetchActivePlans, fetchNets,
  upsertAcademy: vi.fn(), upsertCoach: vi.fn(), setCoachesAcademy: vi.fn(),
  insertPlayer: vi.fn(), insertPlayers: vi.fn(), updateAcademyFields: vi.fn(),
  upsertNet: vi.fn(), deleteNet: vi.fn(),
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

function setupDefaults() {
  fetchPlayers.mockResolvedValue([]);
  fetchCoaches.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  fetchAcademies.mockResolvedValue([]);
  fetchNets.mockResolvedValue([]);
}

describe("AcademyClient", () => {
  test("shows an empty state with the create-first CTA for a platform admin", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });

    render(<AcademyClient />);

    expect(await screen.findByText("No academies found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Create First Academy" })).toBeInTheDocument();
  });

  test("hides the New Academy action for an academy_admin (scoped to their own academy only)", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "My Academy" })]);

    render(<AcademyClient />);

    expect(await screen.findByText("My Academy")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ New Academy" })).not.toBeInTheDocument();
  });

  test("scopes the players/coaches fetch to the academy_admin's own academy", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });

    render(<AcademyClient />);
    await screen.findByRole("heading", { name: "Academies" });

    expect(fetchPlayers).toHaveBeenCalledWith(undefined, "ac1");
    expect(fetchCoaches).toHaveBeenCalledWith("ac1");
  });

  test("renders multiple academies for a platform admin", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([
      makeAcademy({ id: "ac1", name: "Academy One" }),
      makeAcademy({ id: "ac2", name: "Academy Two" }),
    ]);

    render(<AcademyClient />);

    expect(await screen.findByText("Academy One")).toBeInTheDocument();
    expect(screen.getByText("Academy Two")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ New Academy" })).toBeInTheDocument();
  });
});
