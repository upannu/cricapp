import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkMessageModal } from "@/components/BulkMessageModal";
import { makeAuthUser, makePlayer } from "../mocks/fixtures";

const { insertMessage } = vi.hoisted(() => ({ insertMessage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db", () => ({ insertMessage }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const originalFetch = global.fetch;

describe("BulkMessageModal", () => {
  test("asks for confirmation before sending, and doesn't send until confirmed", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ name: "Coach Sam" }) });
    global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ success: true }) }) as typeof fetch;
    const user = userEvent.setup();
    const players = [
      makePlayer({ id: "p1", name: "Alice Bowler", email: "alice@example.com" }),
      makePlayer({ id: "p2", name: "Bob Seamer", email: "bob@example.com" }),
    ];
    render(<BulkMessageModal players={players} onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/Training update this week/), "Training update");
    await user.type(screen.getByPlaceholderText("Write your message..."), "See you Saturday");
    await user.click(screen.getByRole("button", { name: "Send to 2 players" }));

    // Not sent yet — a confirm dialog stands between the form and the actual send.
    expect(insertMessage).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText("Send Email?")).toBeInTheDocument();
    expect(screen.getByText(/will send to 2 players/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yes, Send" }));

    expect(await screen.findByText("Sent to 2 players")).toBeInTheDocument();
    // The real delivery API is called per recipient, not just the message-history log.
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/send-message",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ to: "alice@example.com", subject: "Training update", body: "See you Saturday", fromName: "Coach Sam" }),
      }),
    );
    expect(insertMessage).toHaveBeenCalledTimes(2);
    global.fetch = originalFetch;
  });

  test("backing out of the confirm dialog cancels the send and returns to the form", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser() });
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
    useAuth.mockReturnValue({ user: makeAuthUser() });
    const user = userEvent.setup();
    const players = [makePlayer({ id: "p1", name: "Alice Bowler", phone: "0400000000" })];
    render(<BulkMessageModal players={players} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: "💬 SMS" }));
    await user.type(screen.getByPlaceholderText("Keep it under 160 characters"), "See you Saturday");
    await user.click(screen.getByRole("button", { name: "Send to 1 player" }));

    expect(screen.getByText("Send SMS?")).toBeInTheDocument();
  });

  test("a delivery failure for one recipient doesn't block the others, and the summary reports it", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser() });
    insertMessage.mockClear();
    let call = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      call += 1;
      // Capture the call number now, at invocation time — evaluating the ternary lazily inside
      // the returned json() would read `call` after every fetch() has already fired, since the
      // increments all happen synchronously before either response is awaited.
      const thisCall = call;
      return Promise.resolve({ json: async () => (thisCall === 1 ? { error: "Invalid address" } : { success: true }) });
    }) as typeof fetch;
    const user = userEvent.setup();
    const players = [
      makePlayer({ id: "p1", name: "Alice Bowler", email: "alice@example.com" }),
      makePlayer({ id: "p2", name: "Bob Seamer", email: "bob@example.com" }),
    ];
    render(<BulkMessageModal players={players} onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/Training update this week/), "Training update");
    await user.type(screen.getByPlaceholderText("Write your message..."), "See you Saturday");
    await user.click(screen.getByRole("button", { name: "Send to 2 players" }));
    await user.click(screen.getByRole("button", { name: "Yes, Send" }));

    expect(await screen.findByText("Sent to 1 player")).toBeInTheDocument();
    expect(screen.getByText(/1 delivery failed/)).toBeInTheDocument();
    // Only the successful recipient gets logged to message history.
    expect(insertMessage).toHaveBeenCalledTimes(1);
    global.fetch = originalFetch;
  });

  test("skips players missing the selected channel's contact info, and warns which ones", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser() });
    const user = userEvent.setup();
    const players = [
      makePlayer({ id: "p1", name: "Alice Bowler", phone: "0400000000" }),
      makePlayer({ id: "p2", name: "Bob Seamer", phone: "" }),
    ];
    render(<BulkMessageModal players={players} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: "💬 SMS" }));

    expect(screen.getByText(/1 of 2 players have a mobile number/)).toBeInTheDocument();
    expect(screen.getByText(/Bob will be skipped/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send to 1 player" })).toBeInTheDocument();
  });
});
