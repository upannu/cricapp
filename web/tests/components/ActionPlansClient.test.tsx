import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionPlansClient } from "@/components/ActionPlansClient";
import { makeActionPlan, makePlayer, makeReport } from "../mocks/fixtures";

const { fetchActionPlans, upsertActionPlan, deleteActionPlan, fetchReports } = vi.hoisted(() => ({
  fetchActionPlans: vi.fn(),
  upsertActionPlan: vi.fn(),
  deleteActionPlan: vi.fn(),
  fetchReports: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ fetchActionPlans, upsertActionPlan, deleteActionPlan, fetchReports }));

const player = makePlayer({ id: "p1", name: "Alice Bowler" });

const originalFetch = global.fetch;

describe("ActionPlansClient", () => {
  test("renders existing plans", async () => {
    fetchActionPlans.mockResolvedValue([makeActionPlan({ id: "ap1", title: "Knee Brace Focus" })]);
    fetchReports.mockResolvedValue([]);

    render(<ActionPlansClient player={player} />);

    expect(await screen.findByText("Knee Brace Focus")).toBeInTheDocument();
    expect(screen.getByText("Wall Drill")).toBeInTheDocument();
  });

  test("adding a new plan calls upsertActionPlan and shows it in the list", async () => {
    const user = userEvent.setup();
    fetchActionPlans.mockResolvedValue([]);
    fetchReports.mockResolvedValue([]);
    upsertActionPlan.mockResolvedValue(undefined);

    render(<ActionPlansClient player={player} />);
    await screen.findByText("No action plans yet.");

    await user.click(screen.getByRole("button", { name: "+ Add First Plan" }));
    await user.type(screen.getByPlaceholderText("e.g. Front Knee Stability"), "New Focus Area");
    await user.click(screen.getByRole("button", { name: "Create Plan" }));

    expect(await screen.findByText("New Focus Area")).toBeInTheDocument();
    expect(upsertActionPlan).toHaveBeenCalledWith(expect.objectContaining({ player_id: "p1", title: "New Focus Area" }));
  });

  test("deleting a plan calls deleteActionPlan and removes it from the list", async () => {
    const user = userEvent.setup();
    fetchActionPlans.mockResolvedValue([makeActionPlan({ id: "ap1", title: "Knee Brace Focus" })]);
    fetchReports.mockResolvedValue([]);
    deleteActionPlan.mockResolvedValue(undefined);

    render(<ActionPlansClient player={player} />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Delete Plan" }));

    expect(deleteActionPlan).toHaveBeenCalledWith("ap1");
    expect(screen.queryByText("Knee Brace Focus")).not.toBeInTheDocument();
  });

  test("AI plan generation is hidden until a report has flagged, drill-mapped issues", async () => {
    fetchActionPlans.mockResolvedValue([]);
    fetchReports.mockResolvedValue([makeReport({ drills: [] })]);

    render(<ActionPlansClient player={player} />);
    await screen.findByText("No action plans yet.");

    expect(screen.getByText(/Generate a biomechanics report with a flagged issue first/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate AI Action Plan/ })).not.toBeInTheDocument();
  });

  test("generating an AI plan posts to the API and prepends the result", async () => {
    const user = userEvent.setup();
    fetchActionPlans.mockResolvedValue([]);
    fetchReports.mockResolvedValue([
      makeReport({ id: "r1", date: "2026-02-01", drills: [{ id: "d1", name: "Drill", focus: "", description: "" }] }),
    ]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ plan: makeActionPlan({ id: "ap-ai", title: "AI Plan" }) }),
    }) as typeof fetch;

    render(<ActionPlansClient player={player} />);
    await screen.findByText("No action plans yet.");

    await user.click(screen.getByRole("button", { name: /Generate AI Action Plan/ }));

    expect(await screen.findByText("AI Plan")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/generate-action-plan",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ playerId: "p1", reportId: "r1" }) }),
    );
    global.fetch = originalFetch;
  });
});
