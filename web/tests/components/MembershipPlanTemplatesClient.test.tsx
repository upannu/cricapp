import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MembershipPlanTemplatesClient } from "@/components/MembershipPlanTemplatesClient";
import { makeAuthUser, makeAcademy } from "../mocks/fixtures";
import type { MembershipPlanTemplate } from "@/lib/types";

const { fetchAcademies, fetchCurrentMembershipPlanTemplates, createMembershipPlanTemplateVersion, archiveMembershipPlanTemplate } = vi.hoisted(() => ({
  fetchAcademies: vi.fn(),
  fetchCurrentMembershipPlanTemplates: vi.fn(),
  createMembershipPlanTemplateVersion: vi.fn(),
  archiveMembershipPlanTemplate: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ fetchAcademies, fetchCurrentMembershipPlanTemplates, createMembershipPlanTemplateVersion, archiveMembershipPlanTemplate }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const ACADEMY = makeAcademy({ id: "ac1", name: "Fast Bowlers Academy", currency: "aud" });

const TEMPLATE: MembershipPlanTemplate = {
  id: "mpt1", planKey: "pk1", academyId: "ac1", name: "10 Session Package",
  sessionType: "Net Session", totalSessions: 10, feePerSession: 50,
  status: "active", effectiveFrom: "2026-09-01T00:00:00Z", createdAt: "2026-09-01T00:00:00Z",
};

describe("MembershipPlanTemplatesClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("redirects a non-admin role away", () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    fetchAcademies.mockResolvedValue([]);
    fetchCurrentMembershipPlanTemplates.mockResolvedValue([]);

    render(<MembershipPlanTemplatesClient />);
    expect(replace).toHaveBeenCalledWith("/session-packs");
  });

  test("renders an empty state with no templates", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([]);
    fetchCurrentMembershipPlanTemplates.mockResolvedValue([]);

    render(<MembershipPlanTemplatesClient />);
    expect(await screen.findByText("No plan templates yet.")).toBeInTheDocument();
  });

  test("lists a template with its academy, sessions, fee and status", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([ACADEMY]);
    fetchCurrentMembershipPlanTemplates.mockResolvedValue([TEMPLATE]);

    render(<MembershipPlanTemplatesClient />);

    expect(await screen.findByText("10 Session Package")).toBeInTheDocument();
    expect(screen.getByText("Fast Bowlers Academy")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("$50.00")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  test("creating a plan validates required fields before saving", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    fetchAcademies.mockResolvedValue([ACADEMY]);
    fetchCurrentMembershipPlanTemplates.mockResolvedValue([]);

    render(<MembershipPlanTemplatesClient />);
    await user.click(await screen.findByRole("button", { name: "+ New Plan" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Academy, name, and a positive session count are required.")).toBeInTheDocument();
    expect(createMembershipPlanTemplateVersion).not.toHaveBeenCalled();
  });

  test("creates a new plan as a fresh planKey (not tied to any existing version)", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "academy_admin", academyId: "ac1" }) });
    fetchAcademies.mockResolvedValue([ACADEMY]);
    fetchCurrentMembershipPlanTemplates.mockResolvedValueOnce([]).mockResolvedValueOnce([TEMPLATE]);
    createMembershipPlanTemplateVersion.mockResolvedValue(undefined);

    render(<MembershipPlanTemplatesClient />);
    await user.click(await screen.findByRole("button", { name: "+ New Plan" }));
    await user.type(screen.getByPlaceholderText("10 Session Package"), "20 Session Package");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(createMembershipPlanTemplateVersion).toHaveBeenCalledTimes(1));
    const call = createMembershipPlanTemplateVersion.mock.calls[0][0];
    expect(call).toMatchObject({ planKey: call.id, academyId: "ac1", name: "20 Session Package", sessionType: "Net Session" });
  });

  test("editing an existing plan reuses its planKey to create a new version", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([ACADEMY]);
    fetchCurrentMembershipPlanTemplates.mockResolvedValue([TEMPLATE]);
    createMembershipPlanTemplateVersion.mockResolvedValue(undefined);

    render(<MembershipPlanTemplatesClient />);
    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Edit (new version)"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(createMembershipPlanTemplateVersion).toHaveBeenCalledTimes(1));
    expect(createMembershipPlanTemplateVersion.mock.calls[0][0]).toMatchObject({ planKey: "pk1", name: "10 Session Package" });
  });

  test("archiving inserts a new archived version instead of deleting or updating", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchAcademies.mockResolvedValue([ACADEMY]);
    fetchCurrentMembershipPlanTemplates.mockResolvedValue([TEMPLATE]);
    archiveMembershipPlanTemplate.mockResolvedValue(undefined);

    render(<MembershipPlanTemplatesClient />);
    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Archive"));
    await user.click(await screen.findByRole("button", { name: "Archive" }));

    await vi.waitFor(() => expect(archiveMembershipPlanTemplate).toHaveBeenCalledTimes(1));
    expect(archiveMembershipPlanTemplate.mock.calls[0][0]).toEqual(TEMPLATE);
  });
});
