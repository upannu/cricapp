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

  test("the Training dropdown opens on click, lists Coaching Sessions and Squad Training, and closes on outside click", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach" }), logout: vi.fn(), refreshUser: vi.fn() });

    render(<NavBar />);
    const trigger = screen.getByRole("button", { name: "Training" });
    expect(trigger).toHaveAttribute("aria-haspopup", "true");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Coaching Sessions" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Squad Training" })).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByRole("link", { name: "Coaching Sessions" })).not.toBeInTheDocument();
  });

  test("Escape closes an open nav group dropdown", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach" }), logout: vi.fn(), refreshUser: vi.fn() });

    render(<NavBar />);
    await user.click(screen.getByRole("button", { name: "Training" }));
    expect(screen.getByRole("link", { name: "Squad Training" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("link", { name: "Squad Training" })).not.toBeInTheDocument();
  });

  test("a nav group shows the active style when the current route matches a child, not just an exact match", () => {
    pathname.mockReturnValue("/attendance/group-1");
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach" }), logout: vi.fn(), refreshUser: vi.fn() });

    render(<NavBar />);
    expect(screen.getByRole("button", { name: "Training" })).toHaveClass("text-pace-green");
    pathname.mockReturnValue("/portal");
  });

  test("Admin Center is reachable only by a platform_admin, has an accessible name distinct from the bare gear icon, and groups its items into labeled sections", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin" }), logout: vi.fn(), refreshUser: vi.fn() });
    const { rerender } = render(<NavBar />);
    expect(screen.queryByLabelText("Admin Center")).not.toBeInTheDocument();

    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }), logout: vi.fn(), refreshUser: vi.fn() });
    rerender(<NavBar />);
    const trigger = screen.getByLabelText("Admin Center");
    expect(trigger).toHaveAttribute("aria-haspopup", "true");

    await user.click(trigger);
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("Content & Communications")).toBeInTheDocument();
    expect(screen.getByText("Commercial")).toBeInTheDocument();
    expect(screen.getByText("Growth")).toBeInTheDocument();
    expect(screen.getByText("Access & Security")).toBeInTheDocument();

    // Relabeled per spec — underlying hrefs (asserted below) are unchanged. Items inside the
    // Admin Center panel carry role="menuitem" (the panel itself is role="menu"), not "link".
    expect(screen.getByRole("menuitem", { name: "Content" })).toHaveAttribute("href", "/admin/academy");
    expect(screen.getByRole("menuitem", { name: "Plans & Pricing" })).toHaveAttribute("href", "/admin/plans");
    expect(screen.getByRole("menuitem", { name: "Admin Users" })).toHaveAttribute("href", "/admin/admins");
    expect(screen.queryByText("Manage Content")).not.toBeInTheDocument();
    expect(screen.queryByText("Plan Catalog")).not.toBeInTheDocument();
    expect(screen.queryByText("Platform Admins")).not.toBeInTheDocument();
  });

  test("Escape closes the Admin Center dropdown, and a click inside it does not close it before navigation", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }), logout: vi.fn(), refreshUser: vi.fn() });

    render(<NavBar />);
    await user.click(screen.getByLabelText("Admin Center"));
    const contentLink = screen.getByRole("menuitem", { name: "Content" });
    expect(contentLink).toBeInTheDocument();

    // A click landing inside the dropdown (e.g. on one of its items) must not be treated as an
    // outside click — this regressed once already when Admin Center's container had no ref.
    await user.click(contentLink);
    expect(screen.getByRole("menuitem", { name: "Content" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menuitem", { name: "Content" })).not.toBeInTheDocument();
  });

  test("the mobile panel groups Training/Academy/Insights and Admin Center as collapsed, expandable sections", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }), logout: vi.fn(), refreshUser: vi.fn() });

    render(<NavBar />);
    await user.click(screen.getByLabelText("Open menu"));

    // The desktop nav stays mounted (only CSS-hidden) while the mobile panel is open, so each
    // trigger now exists twice — desktop's first in DOM order, the mobile panel's toggle second.
    expect(screen.queryByRole("link", { name: "Coaching Sessions" })).not.toBeInTheDocument();
    const trainingToggles = screen.getAllByRole("button", { name: "Training" });
    expect(trainingToggles).toHaveLength(2);
    const mobileTrainingToggle = trainingToggles[1];
    expect(mobileTrainingToggle).toHaveAttribute("aria-expanded", "false");
    await user.click(mobileTrainingToggle);
    expect(screen.getByRole("link", { name: "Coaching Sessions" })).toBeInTheDocument();

    const adminToggles = screen.getAllByRole("button", { name: "Admin Center" });
    expect(adminToggles).toHaveLength(2);
    const mobileAdminToggle = adminToggles[1];
    expect(mobileAdminToggle).toHaveAttribute("aria-expanded", "false");
    await user.click(mobileAdminToggle);
    expect(screen.getByRole("link", { name: "Content" })).toBeInTheDocument();
  });
});
