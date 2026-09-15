import { describe, expect, test } from "vitest";
import { GET } from "@/app/api/partnerships/list/route";
import { routeMockState } from "../../setup/api";
import { rawUser } from "../../mocks/caller";

const APPLICATION = {
  id: "prt_1", organisation_name: "Zenith Cricket Board", organisation_type: "National Cricket Board",
  country: "Australia", region: null, website: null,
  scale_players: null, scale_coaches: null, scale_academies: null, scale_regions: null,
  interests: [], challenges: null, current_systems: [], timeline: null,
  contact_first_name: "Priya", contact_last_name: "Shah", job_title: "Head of Cricket",
  email: "priya@zenithcricket.example", phone: null, budget_range: null, additional_notes: null,
  status: "submitted", priority: null, owner_id: null, owner_email: null,
  created_at: "2026-09-14T00:00:00Z", updated_at: "2026-09-14T00:00:00Z",
};

describe("GET /api/partnerships/list", () => {
  test("403 when not signed in", async () => {
    const res = await GET();
    expect(res.status).toBe(403);
  });

  test("403 when the caller is not a platform admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  test("lists applications mapped to the client-facing shape, including a derived reference", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { partnership_applications: { data: [APPLICATION], error: null } };

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.applications).toHaveLength(1);
    expect(body.applications[0]).toMatchObject({
      id: "prt_1", organisationName: "Zenith Cricket Board", status: "submitted",
      reference: expect.stringMatching(/^CRIC-BRD-2026-\d{6}$/),
    });
  });

  test("500 when the query fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { partnership_applications: { data: null, error: { message: "boom" } } };

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
