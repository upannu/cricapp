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
    await user.click(screen.getByTitle("Switch role"));

    expect(await screen.findByText("Parent / Guardian · Kingshuk Pannu")).toBeInTheDocument();
    expect(screen.getByText("Player · Kingshuk Pannu")).toBeInTheDocument();
  });
});
