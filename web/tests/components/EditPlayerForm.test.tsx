import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditPlayerForm } from "@/components/EditPlayerForm";
import { makePlayer } from "../mocks/fixtures";

const { updatePlayer } = vi.hoisted(() => ({ updatePlayer: vi.fn() }));
vi.mock("@/lib/db", () => ({ updatePlayer }));

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("EditPlayerForm", () => {
  test("pre-fills fields from the player and saves edits", async () => {
    const user = userEvent.setup();
    updatePlayer.mockResolvedValue(undefined);
    const player = makePlayer({ id: "p1", name: "Alice Bowler", email: "alice@example.com" });

    render(<EditPlayerForm player={player} />);

    const nameInput = screen.getByDisplayValue("Alice Bowler");
    await user.clear(nameInput);
    await user.type(nameInput, "Alice B. Bowler");

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(updatePlayer).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "Alice B. Bowler", email: "alice@example.com" }));
    expect(await screen.findByRole("button", { name: "✓ Saved" })).toBeInTheDocument();
  });

  test("auto-computes the end date from start date, total sessions and weekly frequency", async () => {
    const user = userEvent.setup();
    const player = makePlayer({
      id: "p1",
      subscription: { plan: "Player Pro", startDate: "2026-01-05", endDate: "2026-01-05", sessionsUsed: 0, sessionsLimit: null },
    });

    render(<EditPlayerForm player={player} />);

    await user.type(screen.getByPlaceholderText("Leave blank for unlimited"), "8");
    await user.selectOptions(screen.getByText("— Select frequency —").closest("select")!, "2");

    // 8 sessions at 2/week = 4 weeks -> 2026-01-05 + 28 days = 2026-02-02
    expect(await screen.findByText("≈ 4 weeks total")).toBeInTheDocument();
  });
});
