import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CoachChatWidget } from "@/components/CoachChatWidget";
import { makeAuthUser } from "../mocks/fixtures";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const originalFetch = global.fetch;

/** Builds a fetch Response whose body streams the given text chunks, matching
 * the real /api/coach-chat route's ReadableStream shape (see CoachChatWidget's
 * reader.read() loop). */
function streamingResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("CoachChatWidget", () => {
  test("renders nothing when no user is signed in", () => {
    useAuth.mockReturnValue({ user: null });
    const { container } = render(<CoachChatWidget />);
    expect(container).toBeEmptyDOMElement();
  });

  test("opens on click and shows suggestion prompts", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player" }) });

    render(<CoachChatWidget />);
    await user.click(screen.getByRole("button", { name: "Open Coach AI chat" }));

    expect(screen.getByText("Coach AI")).toBeInTheDocument();
    expect(screen.getByText("What does my front knee angle mean?")).toBeInTheDocument();
  });

  test("sends a message and streams the assistant's reply in", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player" }) });
    global.fetch = vi.fn().mockResolvedValue(streamingResponse(["Front knee ", "stability matters most."])) as typeof fetch;

    render(<CoachChatWidget />);
    await user.click(screen.getByRole("button", { name: "Open Coach AI chat" }));
    await user.type(screen.getByPlaceholderText("Ask Coach AI…"), "What does my front knee angle mean?");
    await user.click(screen.getByRole("button", { name: "→" }));

    expect(await screen.findByText("Front knee stability matters most.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/coach-chat",
      expect.objectContaining({
        body: JSON.stringify({ messages: [{ role: "user", content: "What does my front knee angle mean?" }] }),
      }),
    );
    global.fetch = originalFetch;
  });

  test("shows the server's error message when the API call fails", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "player" }) });
    global.fetch = vi.fn().mockResolvedValue({ ok: false, body: null, json: async () => ({ error: "Coach AI is off-topic-guarded and refused." }) }) as typeof fetch;

    render(<CoachChatWidget />);
    await user.click(screen.getByRole("button", { name: "Open Coach AI chat" }));
    await user.click(screen.getByRole("button", { name: "Give me a drill for over-striding" }));

    expect(await screen.findByText("Coach AI is off-topic-guarded and refused.")).toBeInTheDocument();
    global.fetch = originalFetch;
  });
});
