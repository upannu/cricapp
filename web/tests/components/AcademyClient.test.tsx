import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AcademyClient } from "@/components/AcademyClient";
import { makeAcademy, makeAuthUser } from "../mocks/fixtures";

const { fetchAcademies, fetchPlayers, fetchCoaches, fetchActivePlans, insertPlayer, upsertCoach, updateAcademyFields } = vi.hoisted(() => ({
  fetchAcademies: vi.fn(), fetchPlayers: vi.fn(), fetchCoaches: vi.fn(), fetchActivePlans: vi.fn(),
  insertPlayer: vi.fn(), upsertCoach: vi.fn(), updateAcademyFields: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchAcademies, fetchPlayers, fetchCoaches, fetchActivePlans,
  upsertAcademy: vi.fn(), upsertCoach, setCoachesAcademy: vi.fn(),
  insertPlayer, insertPlayers: vi.fn(), updateAcademyFields,
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { push, replace, searchParamsGet } = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), searchParamsGet: vi.fn((_key: string) => null as string | null),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => ({ get: searchParamsGet }),
}));

function setupDefaults() {
  fetchPlayers.mockResolvedValue([]);
  fetchCoaches.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  fetchAcademies.mockResolvedValue([]);
  insertPlayer.mockResolvedValue(undefined);
  upsertCoach.mockResolvedValue(undefined);
  updateAcademyFields.mockResolvedValue(undefined);
  searchParamsGet.mockReturnValue(null);
}

describe("AcademyClient", () => {
  test("shows an empty state with the create-first CTA for a platform admin", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });

    render(<AcademyClient />);

    expect(await screen.findByText("No academies found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Create First Academy" })).toBeInTheDocument();
  });

  test("hides the New Academy action for an academy_admin (scoped to their own academy only)", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "My Academy" })]);

    render(<AcademyClient />);

    expect(await screen.findByText("My Academy")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ New Academy" })).not.toBeInTheDocument();
  });

  // Clicking a row now navigates straight to the academy's own profile page instead of expanding
  // an accordion in place — matching Coaches/Players' own dedicated detail pages.
  test("clicking a row navigates to the academy's profile page", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "Riverside Academy" })]);

    render(<AcademyClient />);
    await user.click(await screen.findByText("Riverside Academy"));

    expect(push).toHaveBeenCalledWith("/academies/ac1");
  });

  test("a platform admin reaches Edit Academy and Deactivate through the row's ⋮ menu", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "Riverside Academy", status: "Active" })]);

    render(<AcademyClient />);
    await screen.findByText("Riverside Academy");

    // Not a direct row button — reachable only via the ⋮ menu for platform_admin.
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Deactivate"));

    expect(await screen.findByText("Deactivate Academy?")).toBeInTheDocument();
  });

  // upsertAcademy's .upsert() validates as if it were a fresh INSERT even against an existing row
  // — a partial {id, status} payload is missing NOT NULL columns (name, description, location...)
  // and fails outright. This confirms the toggle uses a real UPDATE (updateAcademyFields) instead,
  // same fix already made for the identical bug on Coaches' own status toggle.
  test("deactivating an academy calls updateAcademyFields with just the status, not a full upsert", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "Riverside Academy", status: "Active" })]);

    render(<AcademyClient />);
    await screen.findByText("Riverside Academy");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Deactivate"));
    await user.click(screen.getByRole("button", { name: "Yes, Deactivate" }));

    expect(updateAcademyFields).toHaveBeenCalledWith("ac1", { status: "Inactive" });
  });

  test("a failed deactivate shows the real error inside the still-open confirm dialog, not silently", async () => {
    const user = userEvent.setup();
    setupDefaults();
    updateAcademyFields.mockRejectedValueOnce(new Error("Row-level security denied this update."));
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "Riverside Academy", status: "Active" })]);

    render(<AcademyClient />);
    await screen.findByText("Riverside Academy");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Deactivate"));
    await user.click(screen.getByRole("button", { name: "Yes, Deactivate" }));

    expect(await screen.findByText("Row-level security denied this update.")).toBeInTheDocument();
    expect(screen.getByText("Deactivate Academy?")).toBeInTheDocument();
  });

  test("scopes the players/coaches fetch to the academy_admin's own academy", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });

    render(<AcademyClient />);
    await screen.findByRole("heading", { name: "Academies" });

    expect(fetchPlayers).toHaveBeenCalledWith(undefined, "ac1");
    expect(fetchCoaches).toHaveBeenCalledWith("ac1");
  });

  test("renders multiple academies for a platform admin", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([
      makeAcademy({ id: "ac1", name: "Academy One" }),
      makeAcademy({ id: "ac2", name: "Academy Two" }),
    ]);

    render(<AcademyClient />);

    expect(await screen.findByText("Academy One")).toBeInTheDocument();
    expect(screen.getByText("Academy Two")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ New Academy" })).toBeInTheDocument();
  });

  test("adds the signed-in admin as head coach from the New Academy modal's Owner field", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin", name: "Jordan Blake", email: "jordan@crichq.com.au" }) });

    render(<AcademyClient />);
    await user.click(await screen.findByRole("button", { name: "+ New Academy" }));
    await user.type(screen.getByPlaceholderText("e.g. Brisbane Fast Bowling Foundation"), "Brand New Academy");
    await user.click(screen.getByRole("button", { name: /Add Yourself as Head Coach/ }));

    // The Owner picker only renders coach options once one exists — its appearance here is
    // itself proof the shortcut created a coach and staged it as the draft's headCoachId.
    await screen.findByText("★ Owner");
    expect(upsertCoach).toHaveBeenCalledWith(expect.objectContaining({ name: "Jordan Blake", email: "jordan@crichq.com.au" }));
  });

  // The academy profile page's own "Edit Academy" button has no dedicated edit page to route to
  // (unlike Coach/Player) — it comes back here with ?edit=<id> to reopen this same modal instead.
  test("a ?edit=<id> query param reopens the Edit Academy modal for that academy", async () => {
    setupDefaults();
    searchParamsGet.mockImplementation((key: string) => (key === "edit" ? "ac1" : null));
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "Riverside Academy" })]);

    render(<AcademyClient />);

    expect(await screen.findByDisplayValue("Riverside Academy")).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/academy");
  });

  test("clicking the Active programs stat card filters the list to Active academies", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([
      makeAcademy({ id: "ac1", name: "Riverside Academy", status: "Active" }),
      makeAcademy({ id: "ac2", name: "Retired Academy", status: "Inactive" }),
    ]);

    render(<AcademyClient />);
    await screen.findByText("Riverside Academy");

    await user.click(screen.getByRole("button", { name: /^Active programs 1$/ }));

    expect(screen.getByText("Riverside Academy")).toBeInTheDocument();
    expect(screen.queryByText("Retired Academy")).not.toBeInTheDocument();
  });

  test("clicking the Inactive stat card filters the list to Inactive academies", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([
      makeAcademy({ id: "ac1", name: "Riverside Academy", status: "Active" }),
      makeAcademy({ id: "ac2", name: "Retired Academy", status: "Inactive" }),
    ]);

    render(<AcademyClient />);
    await screen.findByText("Riverside Academy");

    // Anchored — the plain "Inactive" filter tab shares this label; the stat card's own
    // accessible name has its count appended after it ("Inactive 1").
    await user.click(screen.getByRole("button", { name: /^Inactive 1$/ }));

    expect(screen.getByText("Retired Academy")).toBeInTheDocument();
    expect(screen.queryByText("Riverside Academy")).not.toBeInTheDocument();
  });

  test("paginates the table at 10 academies per page", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => makeAcademy({ id: `ac${i + 1}`, name: `Academy ${String(i + 1).padStart(2, "0")}` })),
    );

    render(<AcademyClient />);
    await screen.findByText("Academy 01");

    expect(screen.getByText("Showing 1–10 of 12")).toBeInTheDocument();
    expect(screen.getByText("Academy 10")).toBeInTheDocument();
    expect(screen.queryByText("Academy 11")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "← Prev" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next →" }));

    expect(await screen.findByText("Academy 11")).toBeInTheDocument();
    expect(screen.getByText("Academy 12")).toBeInTheDocument();
    expect(screen.queryByText("Academy 01")).not.toBeInTheDocument();
  });

  test("shows no pagination controls at 10 academies or fewer", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => makeAcademy({ id: `ac${i + 1}`, name: `Academy ${String(i + 1).padStart(2, "0")}` })),
    );

    render(<AcademyClient />);
    await screen.findByText("Academy 10");
    expect(screen.getByText("Showing 1–10 of 10")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  test("sorts the table by clicking a column header, matching Coaches' own click-to-sort headers", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([
      makeAcademy({ id: "ac1", name: "Zenith Academy" }),
      makeAcademy({ id: "ac2", name: "Alpha Academy" }),
    ]);

    render(<AcademyClient />);
    await screen.findByText("Zenith Academy");

    // Default sort is by name ascending — Alpha before Zenith.
    let names = screen.getAllByText(/Academy$/).map((el) => el.textContent);
    expect(names.indexOf("Alpha Academy")).toBeLessThan(names.indexOf("Zenith Academy"));

    // Clicking the active column again flips the direction. Scoped to the table header — "+ New
    // Academy" also matches a loose /Academy/ name query.
    await user.click(within(screen.getByRole("table")).getByText("Academy"));

    names = screen.getAllByText(/Academy$/).map((el) => el.textContent);
    expect(names.indexOf("Zenith Academy")).toBeLessThan(names.indexOf("Alpha Academy"));
  });

  test("a platform admin can also reach Billing through the row's ⋮ menu", async () => {
    const user = userEvent.setup();
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "ac1", name: "Riverside Academy", status: "Active" })]);

    render(<AcademyClient />);
    await screen.findByText("Riverside Academy");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Billing"));

    expect(push).toHaveBeenCalledWith("/academies/ac1/billing");
  });
});
