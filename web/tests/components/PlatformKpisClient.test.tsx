import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlatformKpisClient } from "@/components/PlatformKpisClient";
import { makeAcademy, makeAuthUser } from "../mocks/fixtures";

const { fetchAcademies, fetchCoaches, fetchAllPlans } = vi.hoisted(() => ({
  fetchAcademies: vi.fn(), fetchCoaches: vi.fn(), fetchAllPlans: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ fetchAcademies, fetchCoaches, fetchAllPlans }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchCoaches.mockResolvedValue([]);
  fetchAllPlans.mockResolvedValue([]);
  fetchAcademies.mockResolvedValue([]);
}

describe("PlatformKpisClient", () => {
  test("redirects a non-platform-admin away", () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });

    render(<PlatformKpisClient />);
    expect(replace).toHaveBeenCalledWith("/players");
  });

  test("flags an active academy with no plan as needing attention", async () => {
    setupDefaults();
    fetchAcademies.mockResolvedValue([
      makeAcademy({ id: "ac1", name: "Healthy Academy", status: "Active", planId: "plan1" }),
      makeAcademy({ id: "ac2", name: "Needs Attention Academy", status: "Active", planId: undefined }),
    ]);

    render(<PlatformKpisClient />);

    expect(await screen.findByText("Healthy Academy")).toBeInTheDocument();
    expect(screen.getByText("Needs Attention Academy")).toBeInTheDocument();
    const attentionLabel = screen.getByText("Needs attention");
    expect(attentionLabel.previousElementSibling).toHaveTextContent("1");
  });
});
