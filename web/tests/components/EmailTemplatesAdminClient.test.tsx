import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmailTemplatesAdminClient } from "@/components/EmailTemplatesAdminClient";
import { makeAuthUser } from "../mocks/fixtures";

const { fetchEmailTemplates } = vi.hoisted(() => ({ fetchEmailTemplates: vi.fn() }));
vi.mock("@/lib/db", () => ({ fetchEmailTemplates }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: push }) }));

function setupDefaults() {
  useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
  fetchEmailTemplates.mockResolvedValue([
    { id: "player", subject: "Welcome player", heading: "Hi {{name}}", body: "Player body." },
    { id: "coach", subject: "Welcome coach", heading: "Hi {{name}}", body: "Coach body." },
    { id: "academy_admin", subject: "Welcome academy", heading: "Hi {{name}}", body: "Academy body." },
    { id: "parent", subject: "Welcome parent", heading: "Hi {{name}}", body: "Parent body." },
    // Deliberately no "coach_invite" row — proves the tab still works with no DB row yet.
  ]);
}

describe("EmailTemplatesAdminClient", () => {
  test("renders a Coach Invite tab alongside the four welcome-email roles", async () => {
    setupDefaults();
    render(<EmailTemplatesAdminClient />);

    expect(await screen.findByRole("button", { name: "Coach Invite" })).toBeInTheDocument();
  });

  test("a brand-new template with no DB row yet still shows editable fields, and Save stays disabled until something's typed", async () => {
    const user = userEvent.setup();
    setupDefaults();
    render(<EmailTemplatesAdminClient />);

    await user.click(await screen.findByRole("button", { name: "Coach Invite" }));

    // Subject, Heading (text inputs) then Body (textarea), in that DOM order — none of the three
    // have an id/htmlFor pairing to query by label, so position is the reliable anchor here.
    const [subjectInput] = screen.getAllByRole("textbox");
    expect(subjectInput).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();

    await user.type(subjectInput, "You're invited!");
    expect(screen.getByRole("button", { name: "Save Changes" })).not.toBeDisabled();
  });

  test("saving a brand-new template posts its id to the update endpoint", async () => {
    const user = userEvent.setup();
    setupDefaults();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true })));

    render(<EmailTemplatesAdminClient />);
    await user.click(await screen.findByRole("button", { name: "Coach Invite" }));
    await user.type(screen.getAllByRole("textbox")[0], "You're invited!");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(fetchSpy).toHaveBeenCalledWith("/api/email-templates/update", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ id: "coach_invite", subject: "You're invited!", heading: "", body: "" }),
    }));
    expect(await screen.findByRole("button", { name: "✓ Saved" })).toBeInTheDocument();

    fetchSpy.mockRestore();
  });
});
