import { describe, expect, test, vi } from "vitest";
import { POST } from "@/app/api/request-additional-role/route";
import { routeMockState } from "../setup/api";
import { jsonRequest } from "../mocks/caller";

const URL = "http://localhost/api/request-additional-role";
const originalFetch = global.fetch;
const EXISTING_USER = { id: "auth-1", email: "existing@example.com", user_metadata: { role: "coach", coach_id: "c1" } };

const VALID_BODY = { name: "Existing User", email: "existing@example.com", password: "correct-password", role: "academy_admin" };

describe("POST /api/request-additional-role", () => {
  test("400 when required fields are missing", async () => {
    const res = await POST(jsonRequest(URL, { name: "X" }));
    expect(res.status).toBe(400);
  });

  test("404 when no existing account matches the email", async () => {
    routeMockState.authAdminResponses = { listUsers: { data: { users: [] }, error: null } };
    const res = await POST(jsonRequest(URL, VALID_BODY));
    expect(res.status).toBe(404);
  });

  test("403 when the password doesn't match (ownership not proven)", async () => {
    routeMockState.authAdminResponses = { listUsers: { data: { users: [EXISTING_USER] }, error: null } };
    routeMockState.authResponses = { signInWithPassword: { data: {}, error: { message: "invalid credentials" } } };

    const res = await POST(jsonRequest(URL, VALID_BODY));
    expect(res.status).toBe(403);
  });

  test("409 when the account already has this role", async () => {
    routeMockState.authAdminResponses = { listUsers: { data: { users: [EXISTING_USER] }, error: null } };
    routeMockState.authResponses = { signInWithPassword: { data: {}, error: null } };

    const res = await POST(jsonRequest(URL, { ...VALID_BODY, role: "coach" }));
    expect(res.status).toBe(409);
  });

  test("queues a link request once ownership is proven", async () => {
    routeMockState.authAdminResponses = { listUsers: { data: { users: [EXISTING_USER] }, error: null } };
    routeMockState.authResponses = { signInWithPassword: { data: {}, error: null } };
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as typeof fetch;

    const res = await POST(jsonRequest(URL, VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const serviceClient = routeMockState.allServiceClients[0];
    expect(serviceClient.tables.user_requests.insert).toHaveBeenCalledWith(
      expect.objectContaining({ role: "academy_admin", request_type: "link", existing_user_id: "auth-1" }),
    );
    global.fetch = originalFetch;
  });
});
