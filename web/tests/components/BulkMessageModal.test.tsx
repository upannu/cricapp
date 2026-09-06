import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkMessageModal } from "@/components/BulkMessageModal";
import { makePlayer } from "../mocks/fixtures";

const { insertMessage } = vi.hoisted(() => ({ insertMessage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db", () => ({ insertMessage }));

describe("BulkMessageModal", () => {
  test("asks for confirmation before sending, and doesn't send until confirmed", async () => {
    const user = userEvent.setup();
    const players = [makePlayer({ id: "p1", name: "Alice Bowler" }), makePlayer({ id: "p2", name: "Bob Seamer" })];
    render(<BulkMessageModal players={players} onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/Training update this week/), "Training update");
    await user.type(screen.getByPlaceholderText("Write your message..."), "See you Saturday");
    await user.click(screen.getByRole("button", { name: "Send to 2 players" }));

    // Not sent yet — a confirm dialog stands between the form and the actual send.
    expect(insertMessage).not.toHaveBeenCalled();
    expect(screen.getByText("Send Email?")).toBeInTheDocument();
    expect(screen.getByText(/will send to 2 players/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yes, Send" }));

    expect(insertMessage).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Sent to 2 players")).toBeInTheDocument();
  });

  test("backing out of the confirm dialog cancels the send and returns to the form", async () => {
    insertMessage.mockClear();
    const user = userEvent.setup();
    const players = [makePlayer({ id: "p1", name: "Alice Bowler" })];
    render(<BulkMessageModal players={players} onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/Training update this week/), "Training update");
    await user.type(screen.getByPlaceholderText("Write your message..."), "See you Saturday");
    await user.click(screen.getByRole("button", { name: "Send to 1 player" }));
    expect(screen.getByText("Send Email?")).toBeInTheDocument();

    // Two "Cancel" buttons exist once the confirm dialog is open (the form's own, and the
    // dialog's) — the dialog's is the one rendered last in document order.
    const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
    await user.click(cancelButtons[cancelButtons.length - 1]);

    expect(insertMessage).not.toHaveBeenCalled();
    expect(screen.queryByText("Send Email?")).not.toBeInTheDocument();
    // Still on the compose form, not the "sent" state.
    expect(screen.getByRole("button", { name: "Send to 1 player" })).toBeInTheDocument();
  });

  test("confirm dialog reflects SMS when that channel is selected", async () => {
    const user = userEvent.setup();
    const players = [makePlayer({ id: "p1", name: "Alice Bowler", phone: "0400000000" })];
    render(<BulkMessageModal players={players} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: "💬 SMS" }));
    await user.type(screen.getByPlaceholderText("Keep it under 160 characters"), "See you Saturday");
    await user.click(screen.getByRole("button", { name: "Send to 1 player" }));

    expect(screen.getByText("Send SMS?")).toBeInTheDocument();
  });
});
