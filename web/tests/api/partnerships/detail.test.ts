import { describe, expect, test } from "vitest";
import { GET } from "@/app/api/partnerships/[id]/route";
import { routeMockState } from "../../setup/api";
import { rawUser } from "../../mocks/caller";

const URL = "http://localhost/api/partnerships/prt_1";
function callGet(id = "prt_1") {
  return GET(new Request(URL), { params: Promise.resolve({ id }) });
}

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

const ACTIVITY = {
  id: "pact_1", application_id: "prt_1", kind: "submitted", body: "Application submitted via the public partnership form.",
  from_status: null, to_status: null, created_by: "system", created_at: "2026-09-14T00:00:00Z",
};

describe("GET /api/partnerships/[id]", () => {
  test("403 when not signed in", async () => {
    const res = await callGet();
    expect(res.status).toBe(403);
  });

  test("403 when the caller is not a platform admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "c1" });
    const res = await callGet();
    expect(res.status).toBe(403);
  });

  test("404 when the application doesn't exist", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { partnership_applications: { data: null, error: null } };
    const res = await callGet("bogus");
    expect(res.status).toBe(404);
  });

  test("returns the application and its activity feed", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      partnership_applications: { data: APPLICATION, error: null },
      partnership_activity: { data: [ACTIVITY], error: null },
    };

    const res = await callGet();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.application).toMatchObject({ id: "prt_1", organisationName: "Zenith Cricket Board" });
    expect(body.activity).toHaveLength(1);
    expect(body.activity[0]).toMatchObject({ id: "pact_1", kind: "submitted", applicationId: "prt_1" });
  });
});
