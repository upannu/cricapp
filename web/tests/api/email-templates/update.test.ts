import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/email-templates/update/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/email-templates/update";
const BODY = { id: "coach", subject: "Subject", heading: "Heading", body: "Body text." };

describe("POST /api/email-templates/update", () => {
  test("400 for an id outside the known set", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    const res = await POST(jsonRequest(URL, { ...BODY, id: "not-a-real-template" }));
    expect(res.status).toBe(400);
  });

  test("403 for anyone other than a platform admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    const res = await POST(jsonRequest(URL, BODY));
    expect(res.status).toBe(403);
  });

  test("saves an existing template", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { email_templates: { data: null, error: null } };

    const res = await POST(jsonRequest(URL, BODY));
    expect(res.status).toBe(200);
    expect(routeMockState.lastServiceClient!.tables.email_templates.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "coach", subject: "Subject", heading: "Heading", body: "Body text." }),
    );
  });

  // The whole point of upsert over update: coach_invite (or any future id) can be saved for the
  // first time with no pre-existing row — update() would silently affect zero rows and never
  // actually create it.
  test("creates a brand-new template id that has no row yet — coach_invite", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { email_templates: { data: null, error: null } };

    const res = await POST(jsonRequest(URL, { ...BODY, id: "coach_invite" }));
    expect(res.status).toBe(200);
    expect(routeMockState.lastServiceClient!.tables.email_templates.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "coach_invite" }),
    );
  });
});
