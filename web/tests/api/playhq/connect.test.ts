import { describe, expect, test, vi } from "vitest";
import { POST } from "@/app/api/playhq/connect/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const { fetchOrganisationSeasons } = vi.hoisted(() => ({ fetchOrganisationSeasons: vi.fn() }));
vi.mock("@/lib/playhq", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/playhq")>();
  return { ...original, fetchOrganisationSeasons };
});

const URL = "http://localhost/api/playhq/connect";

describe("POST /api/playhq/connect", () => {
  test("400 when academyId or playhqOrgId is missing", async () => {
    const res = await POST(jsonRequest(URL, { academyId: "ac1" }));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { academyId: "ac1", playhqOrgId: "org1" }));
    expect(res.status).toBe(401);
  });

  test("403 when caller is an academy_admin for a different academy", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "someone-elses" });
    const res = await POST(jsonRequest(URL, { academyId: "ac1", playhqOrgId: "org1" }));
    expect(res.status).toBe(403);
  });

  test("502 when PlayHQ rejects the organisation id", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    fetchOrganisationSeasons.mockRejectedValueOnce(new Error("Organisation not found."));
    const res = await POST(jsonRequest(URL, { academyId: "ac1", playhqOrgId: "bad-org" }));
    expect(res.status).toBe(502);
  });

  test("saves the connection once PlayHQ confirms the organisation", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    fetchOrganisationSeasons.mockResolvedValueOnce([{ id: "season1", name: "2026 Season" }]);
    routeMockState.tableResponses = { academies: { data: null, error: null } };

    const res = await POST(jsonRequest(URL, { academyId: "ac1", playhqOrgId: "org1", playhqOrgName: "My Club" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.academies.update).toHaveBeenCalledWith(
      expect.objectContaining({ playhq_org_id: "org1", playhq_org_name: "My Club" }),
    );
  });
});
