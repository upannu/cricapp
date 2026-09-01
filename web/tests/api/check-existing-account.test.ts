import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/check-existing-account/route";
import { routeMockState } from "../setup/api";
import { jsonRequest } from "../mocks/caller";

const URL = "http://localhost/api/check-existing-account";

describe("POST /api/check-existing-account", () => {
  test("400 when email is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("returns exists:true for a matching email (case-insensitive)", async () => {
    routeMockState.authAdminResponses = { listUsers: { data: { users: [{ id: "u1", email: "someone@example.com" }] }, error: null } };
    const res = await POST(jsonRequest(URL, { email: "SOMEONE@example.com" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ exists: true });
  });

  test("returns exists:false when no account matches", async () => {
    routeMockState.authAdminResponses = { listUsers: { data: { users: [] }, error: null } };
    const res = await POST(jsonRequest(URL, { email: "nobody@example.com" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ exists: false });
  });

  test("500 when listing users fails", async () => {
    routeMockState.authAdminResponses = { listUsers: { data: { users: [] }, error: { message: "down" } } };
    const res = await POST(jsonRequest(URL, { email: "x@example.com" }));
    expect(res.status).toBe(500);
  });
});
