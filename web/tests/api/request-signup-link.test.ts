import { describe, expect, test, vi, afterEach } from "vitest";
import { POST } from "@/app/api/request-signup-link/route";
import { routeMockState } from "../setup/api";
import { jsonRequest } from "../mocks/caller";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn(async (_opts: Record<string, unknown>) => ({})) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const URL = "http://localhost/api/request-signup-link";
const BODY = { name: "Jamie Parent", email: "jamie@example.com", password: "supersecret1", role: "parent", playerLookupEmail: "kid@example.com" };

describe("POST /api/request-signup-link", () => {
  afterEach(() => {
    sendMail.mockClear();
  });

  test("400 when a required field is missing", async () => {
    const res = await POST(jsonRequest(URL, { ...BODY, playerLookupEmail: undefined }));
    expect(res.status).toBe(400);
  });

  test("400 for a role this route doesn't handle", async () => {
    const res = await POST(jsonRequest(URL, { ...BODY, role: "coach" }));
    expect(res.status).toBe(400);
  });

  test("400 when the password is too short", async () => {
    const res = await POST(jsonRequest(URL, { ...BODY, password: "short" }));
    expect(res.status).toBe(400);
  });

  test("500 when Gmail isn't configured — a deployment-wide answer, not per-email", async () => {
    vi.stubEnv("GMAIL_USER", "");
    const res = await POST(jsonRequest(URL, BODY));
    expect(res.status).toBe(500);
    vi.unstubAllEnvs();
  });

  test("409 when the submitter's own account email already has an account", async () => {
    routeMockState.authAdminResponses = { listUsers: { data: { users: [{ id: "u1", email: BODY.email }] }, error: null } };
    const res = await POST(jsonRequest(URL, BODY));
    expect(res.status).toBe(409);
  });

  test("matched and unmatched lookups get an identical response — that's the whole point of this route", async () => {
    routeMockState.tableResponses = { players: { data: [{ id: "p1" }], error: null } };
    const matchedRes = await POST(jsonRequest(URL, BODY));
    const matchedBody = await matchedRes.json();

    routeMockState.tableResponses = { players: { data: [], error: null } };
    const unmatchedRes = await POST(jsonRequest(URL, BODY));
    const unmatchedBody = await unmatchedRes.json();

    expect(matchedRes.status).toBe(unmatchedRes.status);
    expect(Object.keys(matchedBody).sort()).toEqual(Object.keys(unmatchedBody).sort());
    expect(matchedBody).toEqual(unmatchedBody);
  });

  test("a match creates the account, links it, and emails the CHILD's email — never the submitter's", async () => {
    routeMockState.tableResponses = { players: { data: [{ id: "p1" }], error: null } };
    const res = await POST(jsonRequest(URL, BODY));
    expect(res.status).toBe(200);

    const client = routeMockState.lastServiceClient!;
    expect(client.auth.admin.generateLink).toHaveBeenCalledWith(expect.objectContaining({
      type: "signup", email: BODY.email, password: BODY.password,
    }));
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith("mock-user-id", {
      app_metadata: { role: "parent", approved: true, player_id: "p1" },
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const sent = sendMail.mock.calls[0][0];
    expect(sent.to).toBe(BODY.playerLookupEmail);
    expect(sent.to).not.toBe(BODY.email);
    expect(sent.html).toContain("token_hash=mock-hashed-token");
    expect(sent.html).toContain("type=signup");
  });

  test("multiple matches (siblings) all go into linkedIdentities, and the account still only gets one email", async () => {
    routeMockState.tableResponses = { players: { data: [{ id: "p1" }, { id: "p2" }, { id: "p3" }], error: null } };
    await POST(jsonRequest(URL, BODY));

    const client = routeMockState.lastServiceClient!;
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith("mock-user-id", {
      app_metadata: {
        role: "parent", approved: true, player_id: "p1",
        linkedIdentities: [{ role: "parent", playerId: "p1" }, { role: "parent", playerId: "p2" }, { role: "parent", playerId: "p3" }],
      },
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  test("no match creates nothing and sends nothing", async () => {
    routeMockState.tableResponses = { players: { data: [], error: null } };
    const res = await POST(jsonRequest(URL, BODY));
    expect(res.status).toBe(200);

    const client = routeMockState.lastServiceClient!;
    expect(client.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  test("a role-appropriate account still gets created even if generateLink fails — response stays identical", async () => {
    routeMockState.tableResponses = { players: { data: [{ id: "p1" }], error: null } };
    routeMockState.authAdminResponses = { generateLink: { data: null, error: { message: "boom" } } };
    const res = await POST(jsonRequest(URL, BODY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
