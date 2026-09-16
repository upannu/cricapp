import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionPacksClient } from "@/components/SessionPacksClient";
import { makeAuthUser, makePlayer, makeSessionPack, makeGroupSession, makeAcademy } from "../mocks/fixtures";

const {
  fetchSessionPacks, fetchPlayers, fetchAcademies, fetchCoaches, fetchActivePlans, fetchPackFeeDues,
  fetchGroupSessions, setGroupSessionRoster, upsertSessionPack, updatePackAgreedDays, insertSessionPacks,
  fetchCurrentMembershipPlanTemplates,
} = vi.hoisted(() => ({
  fetchSessionPacks: vi.fn(), fetchPlayers: vi.fn(), fetchAcademies: vi.fn(),
  fetchCoaches: vi.fn(), fetchActivePlans: vi.fn(), fetchPackFeeDues: vi.fn(),
  fetchGroupSessions: vi.fn(), setGroupSessionRoster: vi.fn(),
  upsertSessionPack: vi.fn(), updatePackAgreedDays: vi.fn(), insertSessionPacks: vi.fn(),
  fetchCurrentMembershipPlanTemplates: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  fetchSessionPacks, fetchPlayers, fetchAcademies, fetchCoaches, fetchActivePlans, fetchPackFeeDues,
  fetchGroupSessions, setGroupSessionRoster, upsertSessionPack, updatePackAgreedDays, insertSessionPacks,
  fetchCurrentMembershipPlanTemplates,
  updatePackPaymentStatus: vi.fn(), markPackPaid: vi.fn(),
}));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { routerPush, routerReplace, searchParamsGet } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  searchParamsGet: vi.fn((_key: string) => null as string | null),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useSearchParams: () => ({ get: searchParamsGet }),
}));

function setupDefaults() {
  routerPush.mockClear();
  routerReplace.mockClear();
  searchParamsGet.mockReturnValue(null);
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
  fetchAcademies.mockResolvedValue([]);
  fetchCoaches.mockResolvedValue([]);
  fetchActivePlans.mockResolvedValue([]);
  fetchSessionPacks.mockResolvedValue([]);
  fetchPackFeeDues.mockResolvedValue([]);
  fetchGroupSessions.mockResolvedValue([]);
  fetchCurrentMembershipPlanTemplates.mockResolvedValue([]);
  setGroupSessionRoster.mockClear().mockResolvedValue(undefined);
  upsertSessionPack.mockClear();
  updatePackAgreedDays.mockClear();
  insertSessionPacks.mockClear().mockResolvedValue(undefined);
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }) as unknown as typeof fetch;
}

describe("SessionPacksClient", () => {
  test("shows a player with no purchased membership", async () => {
    setupDefaults();
    render(<SessionPacksClient />);

    expect(await screen.findByRole("heading", { name: "Memberships" })).toBeInTheDocument();
    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.getByText("No Membership")).toBeInTheDocument();
  });

  test("shows membership details for a player with an active membership", async () => {
    setupDefaults();
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ playerId: "p1", totalSessions: 10, sessionsUsed: 3 })]);

    render(<SessionPacksClient />);

    expect(await screen.findByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.queryByText("No Membership")).not.toBeInTheDocument();
  });

  test("scopes the fetch to the academy_admin's own academy", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "academy-9" }) });

    render(<SessionPacksClient />);
    await screen.findByRole("heading", { name: "Memberships" });

    expect(fetchPlayers).toHaveBeenCalledWith(undefined, "academy-9");
  });

  test("searches by player name", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", name: "Alice Bowler" }),
      makePlayer({ id: "p2", name: "Bob Seamer" }),
    ]);
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ playerId: "p1", totalSessions: 10, sessionsUsed: 3 })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    await user.type(screen.getByPlaceholderText("Search by player name…"), "Bob");
    expect(await screen.findByText("Bob Seamer")).toBeInTheDocument();
    expect(screen.queryByText("Alice Bowler")).not.toBeInTheDocument();
  });

  test("?playerId= (from Attendance's no-membership dead-end) auto-opens the New Membership form prefilled for that player", async () => {
    setupDefaults();
    searchParamsGet.mockImplementation((key: string) => (key === "playerId" ? "p1" : null));
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);

    render(<SessionPacksClient />);

    expect(await screen.findByRole("heading", { name: "New Membership" })).toBeInTheDocument();
    expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("p1");
    // strips the query param so a refresh / back doesn't re-trigger
    expect(routerReplace).toHaveBeenCalledWith("/session-packs");
  });

  test("ignores ?playerId= for a coach (they can't create memberships)", async () => {
    setupDefaults();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    searchParamsGet.mockImplementation((key: string) => (key === "playerId" ? "p1" : null));
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    expect(screen.queryByRole("heading", { name: "New Membership" })).not.toBeInTheDocument();
  });

  test("clicking the Active memberships stat card filters the list to players with an active membership", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", name: "Alice Bowler" }),
      makePlayer({ id: "p2", name: "Bob Seamer" }),
    ]);
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ playerId: "p1", totalSessions: 10, sessionsUsed: 3 })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: /^Active memberships 1$/ }));

    expect(screen.getByText("Alice Bowler")).toBeInTheDocument();
    expect(screen.queryByText("Bob Seamer")).not.toBeInTheDocument();
  });

  // A Membership must bind to a real, pre-created squad training session (not a freeform
  // weekday pick) — see groupSessionsForAcademy's own doc comment for why.
  test("New Membership form lists the academy's real squad training sessions, requires picking one, and syncs the player onto its roster on save", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "academy-1", name: "Fast Bowlers Academy" })]);
    fetchGroupSessions.mockResolvedValue([
      makeGroupSession({ id: "gs1", academyId: "academy-1", name: "U14 Tuesday Nets", dayOfWeek: 2, time: "16:00", playerIds: [] }),
    ]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");
    await user.click(screen.getAllByRole("button", { name: "+ New Membership" })[0]);

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "p1");
    await user.selectOptions(selects[1], "academy-1");

    expect(await screen.findByText("U14 Tuesday Nets")).toBeInTheDocument();
    expect(screen.getByText(/Tue · 16:00/)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("0.00"), "20");
    await user.click(screen.getByRole("button", { name: "Create Membership" }));
    expect(screen.getByText("Please select at least one squad training session.")).toBeInTheDocument();

    await user.click(screen.getByText("U14 Tuesday Nets"));
    await user.click(screen.getByRole("button", { name: "Create Membership" }));

    await waitFor(() => expect(setGroupSessionRoster).toHaveBeenCalledWith("gs1", ["p1"]));
    expect(upsertSessionPack).toHaveBeenCalledWith(expect.objectContaining({ agreed_days: ["Tue"] }));
    expect(global.fetch).toHaveBeenCalledWith("/api/packs/notify-created", expect.objectContaining({
      body: expect.stringContaining('"packId"'),
    }));
  });

  test("picking a Plan Template pre-fills sessions and fee, which stay editable afterward", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "academy-1", name: "Fast Bowlers Academy" })]);
    fetchGroupSessions.mockResolvedValue([
      makeGroupSession({ id: "gs1", academyId: "academy-1", name: "U14 Tuesday Nets", dayOfWeek: 2, time: "16:00", playerIds: [] }),
    ]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
    fetchCurrentMembershipPlanTemplates.mockResolvedValue([{
      id: "mpt1", planKey: "mpt1", academyId: "academy-1", name: "20 Session Package",
      sessionType: "Net Session", totalSessions: 20, feePerSession: 35,
      status: "active", effectiveFrom: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z",
    }]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");
    await user.click(screen.getAllByRole("button", { name: "+ New Membership" })[0]);

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "p1");
    await user.selectOptions(selects[1], "academy-1");

    const templateSelect = await screen.findByDisplayValue("— Custom (no template) —");
    await user.selectOptions(templateSelect, "mpt1");

    expect(screen.getByDisplayValue("20 sessions")).toBeInTheDocument();
    expect(screen.getByDisplayValue("35")).toBeInTheDocument();

    // Still a plain editable field, not locked by the template pick.
    await user.clear(screen.getByDisplayValue("35"));
    await user.type(screen.getByPlaceholderText("0.00"), "40");
    expect(screen.getByDisplayValue("40")).toBeInTheDocument();
  });

  test("switching academy clears a previously-picked Plan Template", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchAcademies.mockResolvedValue([
      makeAcademy({ id: "academy-1", name: "Fast Bowlers Academy" }),
      makeAcademy({ id: "academy-2", name: "Other Academy" }),
    ]);
    fetchGroupSessions.mockResolvedValue([
      makeGroupSession({ id: "gs1", academyId: "academy-1", name: "U14 Tuesday Nets", dayOfWeek: 2, time: "16:00", playerIds: [] }),
    ]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
    fetchCurrentMembershipPlanTemplates.mockResolvedValue([{
      id: "mpt1", planKey: "mpt1", academyId: "academy-1", name: "20 Session Package",
      sessionType: "Net Session", totalSessions: 20, feePerSession: 35,
      status: "active", effectiveFrom: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z",
    }]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");
    await user.click(screen.getAllByRole("button", { name: "+ New Membership" })[0]);

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "p1");
    await user.selectOptions(selects[1], "academy-1");
    await user.selectOptions(await screen.findByDisplayValue("— Custom (no template) —"), "mpt1");
    expect(screen.getByDisplayValue(/20 Session Package/)).toBeInTheDocument();

    // academy-2 has no templates, so the whole field disappears — not left showing a stale pick.
    await user.selectOptions(selects[1], "academy-2");
    expect(screen.queryByDisplayValue(/20 Session Package/)).not.toBeInTheDocument();
    expect(screen.queryByText("Plan Template")).not.toBeInTheDocument();
  });

  test("skips the payment-due notification for a fee-waived membership", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "academy-1", name: "Fast Bowlers Academy", planId: "plan-1" })]);
    fetchActivePlans.mockResolvedValue([{
      id: "plan-1", slug: "waived", name: "Waived Plan", audience: "academy", billingType: "subscription",
      billingInterval: "month", priceAud: 0, seatCap: null, accessDurationMonths: null, includedNotes: null,
      waivesSessionFees: true, platformAdminOnly: false, platformFeePercent: 10, active: true, sortOrder: 0,
      sessionsPerMonthLimit: null, selfLogSessionsPerMonthLimit: 4, chatMessagesPerDayLimit: null,
      aiReportsEnabled: true, marketplaceEnabled: true, locked: true,
    }]);
    fetchGroupSessions.mockResolvedValue([
      makeGroupSession({ id: "gs1", academyId: "academy-1", name: "U14 Tuesday Nets", dayOfWeek: 2, time: "16:00", playerIds: [] }),
    ]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");
    await user.click(screen.getAllByRole("button", { name: "+ New Membership" })[0]);

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "p1");
    await user.selectOptions(selects[1], "academy-1");
    await screen.findByText("U14 Tuesday Nets");
    await user.click(screen.getByText("U14 Tuesday Nets"));
    await user.click(screen.getByRole("button", { name: "Create Membership" }));

    await waitFor(() => expect(upsertSessionPack).toHaveBeenCalled());
    expect(global.fetch).not.toHaveBeenCalledWith("/api/packs/notify-created", expect.anything());
  });

  // Regression: a template's own stored fee must not override a fee-waived academy's forced $0 —
  // the fee input is disabled specifically to prevent this, and handleSave trusts draft.feePerSession
  // as-is, so a silent override here would have saved a real fee despite "no session fee" in the UI.
  test("picking a Plan Template on a fee-waived academy does not override the waived $0 fee", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "academy-1", name: "Fast Bowlers Academy", planId: "plan-1" })]);
    fetchActivePlans.mockResolvedValue([{
      id: "plan-1", slug: "waived", name: "Waived Plan", audience: "academy", billingType: "subscription",
      billingInterval: "month", priceAud: 0, seatCap: null, accessDurationMonths: null, includedNotes: null,
      waivesSessionFees: true, platformAdminOnly: false, platformFeePercent: 10, active: true, sortOrder: 0,
      sessionsPerMonthLimit: null, selfLogSessionsPerMonthLimit: 4, chatMessagesPerDayLimit: null,
      aiReportsEnabled: true, marketplaceEnabled: true, locked: true,
    }]);
    fetchGroupSessions.mockResolvedValue([
      makeGroupSession({ id: "gs1", academyId: "academy-1", name: "U14 Tuesday Nets", dayOfWeek: 2, time: "16:00", playerIds: [] }),
    ]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);
    fetchCurrentMembershipPlanTemplates.mockResolvedValue([{
      id: "mpt1", planKey: "mpt1", academyId: "academy-1", name: "20 Session Package",
      sessionType: "Net Session", totalSessions: 20, feePerSession: 35,
      status: "active", effectiveFrom: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z",
    }]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");
    await user.click(screen.getAllByRole("button", { name: "+ New Membership" })[0]);

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "p1");
    await user.selectOptions(selects[1], "academy-1");
    await user.selectOptions(await screen.findByDisplayValue("— Custom (no template) —"), "mpt1");

    // Sessions still prefill from the template...
    expect(screen.getByDisplayValue("20 sessions")).toBeInTheDocument();
    // ...but the fee stays at the waived $0, not the template's $35.
    expect(screen.getByPlaceholderText("0.00")).toHaveValue(null);
    expect(screen.getByPlaceholderText("0.00")).toBeDisabled();

    await user.click(await screen.findByText("U14 Tuesday Nets"));
    await user.click(screen.getByRole("button", { name: "Create Membership" }));

    await waitFor(() => expect(upsertSessionPack).toHaveBeenCalledWith(expect.objectContaining({ fee_per_session: 0 })));
  });

  test("shows an empty state with a link to Attendance when the selected academy has no active squad training sessions", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "academy-1", name: "Fast Bowlers Academy" })]);
    fetchGroupSessions.mockResolvedValue([]);
    fetchPlayers.mockResolvedValue([makePlayer({ id: "p1", name: "Alice Bowler" })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");
    await user.click(screen.getAllByRole("button", { name: "+ New Membership" })[0]);

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[1], "academy-1");

    expect(await screen.findByText(/no active squad training sessions yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create one in Attendance/ })).toHaveAttribute("href", "/attendance");
  });

  // Existing-membership squad-training-session view/edit (read-only until Edit, roster diffing on
  // toggle) now lives entirely on MembershipProfileClient's own View page — see
  // tests/components/MembershipProfileClient.test.tsx for that coverage.

  test("a row's Actions menu links View/Edit to the membership's own pages", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ id: "pack1", playerId: "p1", paymentStatus: "Paid" })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "View" }));
    expect(routerPush).toHaveBeenCalledWith("/session-packs/pack1");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(routerPush).toHaveBeenCalledWith("/session-packs/pack1/edit");
  });

  test("Mark Paid (Cash) on a pending membership opens a confirm, then records payment", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ id: "pack1", playerId: "p1", paymentStatus: "Pending" })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "Mark Paid (Cash)" }));

    expect(await screen.findByText("Mark as Paid (Cash)?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark Paid" }));

    await waitFor(() => expect(screen.queryByText("Mark as Paid (Cash)?")).not.toBeInTheDocument());
  });

  test("Renew Membership on an Exhausted pack prefills the New Membership form", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchGroupSessions.mockResolvedValue([
      makeGroupSession({ id: "gs1", academyId: "academy-1", name: "U14 Tuesday Nets", dayOfWeek: 2, time: "16:00", playerIds: ["p1"] }),
    ]);
    fetchSessionPacks.mockResolvedValue([makeSessionPack({
      id: "pack1", playerId: "p1", academyId: "academy-1", status: "Exhausted", feePerSession: 25, agreedDays: ["Tue"],
    })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "Renew Membership" }));

    expect(await screen.findByRole("heading", { name: "New Membership" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("25")).toBeInTheDocument();
  });

  test("selecting a row shows the bulk action bar with the right count, and Clear deselects everything", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ id: "pack1", playerId: "p1", paymentStatus: "Pending" })]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();

    await user.click(screen.getByTitle("Select for bulk actions"));
    expect(screen.getByText("1 player selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  test("select-all selects every row currently matching the filters/search", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", name: "Alice Bowler" }),
      makePlayer({ id: "p2", name: "Bob Seamer" }),
    ]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByTitle("Select all"));
    expect(screen.getByText("2 players selected")).toBeInTheDocument();

    await user.click(screen.getByTitle("Select all"));
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  test("Bulk Mark Paid records payment for every selected pending membership", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", name: "Alice Bowler" }),
      makePlayer({ id: "p2", name: "Bob Seamer" }),
    ]);
    fetchSessionPacks.mockResolvedValue([
      makeSessionPack({ id: "pack1", playerId: "p1", paymentStatus: "Pending" }),
      makeSessionPack({ id: "pack2", playerId: "p2", paymentStatus: "Pending" }),
    ]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");
    await user.click(screen.getByTitle("Select all"));

    await user.click(screen.getByRole("button", { name: "Mark Paid (2)" }));
    expect(await screen.findByText("Mark Selected as Paid (Cash)?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark Paid" }));

    await waitFor(() => expect(screen.queryByText("Mark Selected as Paid (Cash)?")).not.toBeInTheDocument());
    // Bulk action clears the selection when it finishes.
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  test("Bulk Renew creates a fresh membership for every selected Exhausted membership, preserving its own academy/fee", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchAcademies.mockResolvedValue([makeAcademy({ id: "academy-1", name: "Fast Bowlers Academy" })]);
    fetchPlayers.mockResolvedValue([
      makePlayer({ id: "p1", name: "Alice Bowler" }),
      makePlayer({ id: "p2", name: "Bob Seamer" }),
    ]);
    fetchSessionPacks.mockResolvedValue([
      makeSessionPack({ id: "pack1", playerId: "p1", academyId: "academy-1", status: "Exhausted", feePerSession: 20 }),
      makeSessionPack({ id: "pack2", playerId: "p2", academyId: "academy-1", status: "Exhausted", feePerSession: 30 }),
    ]);

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");
    await user.click(screen.getByTitle("Select all"));

    await user.click(screen.getByRole("button", { name: "Renew (2)" }));
    expect(await screen.findByText("Renew Selected Memberships?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Renew" }));

    await waitFor(() => expect(upsertSessionPack).toHaveBeenCalledTimes(2));
    expect(upsertSessionPack).toHaveBeenCalledWith(expect.objectContaining({ player_id: "p1", fee_per_session: 20, total_sessions: 10 }));
    expect(upsertSessionPack).toHaveBeenCalledWith(expect.objectContaining({ player_id: "p2", fee_per_session: 30, total_sessions: 10 }));
    expect(global.fetch).toHaveBeenCalledWith("/api/packs/notify-created", expect.anything());
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  test("Export CSV downloads a CSV of the selected rows", async () => {
    const user = userEvent.setup();
    setupDefaults();
    fetchSessionPacks.mockResolvedValue([makeSessionPack({ id: "pack1", playerId: "p1" })]);

    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<SessionPacksClient />);
    await screen.findByText("Alice Bowler");

    await user.click(screen.getByTitle("Select for bulk actions"));
    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const [blob] = createObjectURL.mock.calls[0];
    expect(blob.type).toBe("text/csv");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
