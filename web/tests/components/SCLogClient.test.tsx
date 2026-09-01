import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SCLogClient } from "@/components/SCLogClient";
import { makePlayer, makeSCWorkout } from "../mocks/fixtures";

const { fetchSCWorkouts, upsertSCWorkout, deleteSCWorkout } = vi.hoisted(() => ({
  fetchSCWorkouts: vi.fn(),
  upsertSCWorkout: vi.fn(),
  deleteSCWorkout: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ fetchSCWorkouts, upsertSCWorkout, deleteSCWorkout }));

const player = makePlayer({ id: "p1", name: "Alice Bowler" });

describe("SCLogClient", () => {
  test("renders logged workouts", async () => {
    fetchSCWorkouts.mockResolvedValue([makeSCWorkout({ id: "sc1", workoutType: "Strength", durationMins: 45, rpe: 6 })]);

    render(<SCLogClient player={player} />);

    expect(await screen.findByText("Strength")).toBeInTheDocument();
    expect(screen.getByText("45m · RPE 6")).toBeInTheDocument();
  });

  test("logging a new workout calls upsertSCWorkout and shows it in the list", async () => {
    const user = userEvent.setup();
    fetchSCWorkouts.mockResolvedValue([]);
    upsertSCWorkout.mockResolvedValue(undefined);

    render(<SCLogClient player={player} />);
    await screen.findByText("No S&C workouts logged yet.");

    await user.click(screen.getByRole("button", { name: "+ Log First Workout" }));
    await user.click(screen.getByRole("button", { name: "Log Workout" }));

    expect(upsertSCWorkout).toHaveBeenCalledWith(expect.objectContaining({ player_id: "p1", workout_type: "Strength" }));
    expect(await screen.findByText("Strength")).toBeInTheDocument();
  });

  test("deleting a workout calls deleteSCWorkout and removes it from the list", async () => {
    const user = userEvent.setup();
    fetchSCWorkouts.mockResolvedValue([makeSCWorkout({ id: "sc1", workoutType: "Recovery" })]);
    deleteSCWorkout.mockResolvedValue(undefined);

    render(<SCLogClient player={player} />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteSCWorkout).toHaveBeenCalledWith("sc1");
    expect(screen.queryByText("Recovery")).not.toBeInTheDocument();
  });
});
