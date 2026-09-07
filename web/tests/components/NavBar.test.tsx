import { describe, expect, test, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NavBar } from "@/components/NavBar";
import { makeAuthUser } from "../mocks/fixtures";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { push, replace, searchParamsGet, pathname } = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), searchParamsGet: vi.fn(() => null), pathname: vi.fn(() => "/portal"),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => ({ get: searchParamsGet }),
  usePathname: () => pathname(),
}));

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("NavBar", () => {
  test("labels a shared-email child's parent and player identities distinctly, not as an exact duplicate", async () => {
    const user = userEvent.setup();
    // A kid with no email of their own sharing a parent's — the parent has one identity acting
    // as Kingshuk's guardian and a second acting as Kingshuk himself, both pointing at the same
    // playerId. Only linkedIdentities.length > 1 triggers the name-lookup fetch below.
    useAuth.mockReturnValue({
      user: makeAuthUser({
        role: "parent",
        playerId: "p1",
        linkedIdentities: [
          { role: "parent", playerId: "p1" },
          { role: "player", playerId: "p1" },
        ],
      }),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    global.fetch = vi.fn((url: string) => {
      if (String(url).includes("/api/players/linked-names")) {
        return Promise.resolve({
          json: () => Promise.resolve({ players: [{ id: "p1", name: "Kingshuk Pannu", academyName: null }] }),
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    render(<NavBar />);
    await user.click(screen.getByTitle("Account menu"));

    expect(await screen.findByText("Parent / Guardian · Kingshuk Pannu")).toBeInTheDocument();
    expect(screen.getByText("Player · Kingshuk Pannu")).toBeInTheDocument();
  });

  test("a single-identity user's Sign out lives inside the account menu, not as a separate always-visible button", async () => {
    const logout = vi.fn();
    const user = userEvent.setup();
    useAuth.mockReturnValue({
      user: makeAuthUser({ role: "platform_admin" }),
      logout,
      refreshUser: vi.fn(),
    });

    render(<NavBar />);

    // Not visible until the account menu is opened.
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
    // No "Switch role" section for a single-identity user.
    await user.click(screen.getByTitle("Account menu"));
    expect(screen.queryByText("Switch role")).not.toBeInTheDocument();

    await user.click(screen.getByText("Sign out"));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/login");
  });

  test("the header shows only the avatar — name/email/role live inside the account menu, not next to it", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({
      user: makeAuthUser({ role: "platform_admin", name: "Dev Admin", email: "dev@example.com" }),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(<NavBar />);

    // Not visible in the collapsed header — only the avatar trigger is.
    expect(screen.queryByText("Dev Admin")).not.toBeInTheDocument();
    expect(screen.queryByText("dev@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("Platform Admin")).not.toBeInTheDocument();

    await user.click(screen.getByTitle("Account menu"));
    expect(screen.getByText("Dev Admin")).toBeInTheDocument();
    expect(screen.getByText("dev@example.com")).toBeInTheDocument();
    expect(screen.getByText("Platform Admin")).toBeInTheDocument();
  });

  test("the avatar's initials are capped at two letters and strip a parenthetical aside in the name", () => {
    useAuth.mockReturnValue({
      user: makeAuthUser({ role: "platform_admin", name: "Dev Admin (real email)" }),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(<NavBar />);
    expect(screen.getByTitle("Account menu")).toHaveTextContent("DA");
  });

  test("clicking outside the account menu closes it", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({
      user: makeAuthUser({ role: "platform_admin" }),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(<NavBar />);
    await user.click(screen.getByTitle("Account menu"));
    expect(screen.getByText("Sign out")).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
  });
});
