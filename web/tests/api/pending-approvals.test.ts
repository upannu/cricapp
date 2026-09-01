import { describe, expect, test } from "vitest";
import { GET } from "@/app/api/pending-approvals/route";
import { routeMockState } from "../setup/api";
import { rawUser } from "../mocks/caller";

describe("GET /api/pending-approvals", () => {
  test("403 when not signed in", async () => {
    const res = await GET();
    expect(res.status).toBe(403);
  });

  test("403 when the caller is not a platform admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "c1" });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  test("returns the pending requests queue, oldest first", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    const requests = [{ id: "r1", email: "a@example.com", role: "coach", requested_at: "2026-01-01" }];
    routeMockState.tableResponses = { user_requests: { data: requests, error: null } };

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.requests).toEqual(requests);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.user_requests.order).toHaveBeenCalledWith("requested_at", { ascending: true });
  });

  test("500 when the query fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { user_requests: { data: null, error: { message: "db down" } } };
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
