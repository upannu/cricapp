import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlatformAdminsClient } from "@/components/PlatformAdminsClient";
import { makeAuthUser } from "../mocks/fixtures";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const originalFetch = global.fetch;
const CALLER = makeAuthUser({ id: "me", role: "platform_admin" });

function mockListResponse(users: { id: string; email: string; name: string; role: string }[]) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/platform-admins/list")) {
      return { json: async () => ({ users }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true }) } as Response;
  }) as typeof fetch;
}

describe("PlatformAdminsClient", () => {
  test("splits users into Platform Admins and Everyone Else", async () => {
    useAuth.mockReturnValue({ user: CALLER });
    mockListResponse([
      { id: "me", email: "me@example.com", name: "Me", role: "platform_admin" },
      { id: "u2", email: "coach@example.com", name: "A Coach", role: "coach" },
    ]);

    render(<PlatformAdminsClient />);

    expect(await screen.findByText("Platform Admins (1)")).toBeInTheDocument();
    expect(screen.getByText("Everyone Else (1)")).toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();
    global.fetch = originalFetch;
  });

  test("promoting a user posts makeAdmin:true and moves them to the admins group", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: CALLER });
    mockListResponse([
      { id: "me", email: "me@example.com", name: "Me", role: "platform_admin" },
      { id: "u2", email: "coach@example.com", name: "A Coach", role: "coach" },
    ]);

    render(<PlatformAdminsClient />);
    await screen.findByText("A Coach");

    await user.click(screen.getByRole("button", { name: "Make Platform Admin" }));

    expect(await screen.findByText("Platform Admins (2)")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/platform-admins/toggle",
      expect.objectContaining({ body: JSON.stringify({ userId: "u2", makeAdmin: true }) }),
    );
    global.fetch = originalFetch;
  });

  test("does not show a promote/demote action on the caller's own row", async () => {
    useAuth.mockReturnValue({ user: CALLER });
    mockListResponse([{ id: "me", email: "me@example.com", name: "Me", role: "platform_admin" }]);

    render(<PlatformAdminsClient />);
    await screen.findByText("(you)");

    expect(screen.queryByRole("button", { name: "Remove Platform Admin" })).not.toBeInTheDocument();
    global.fetch = originalFetch;
  });
});
