import { describe, expect, test, vi, afterEach } from "vitest";
import { POST } from "@/app/api/packs/notify-created/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn(async (_opts: Record<string, unknown>) => ({})) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const { sendSms } = vi.hoisted(() => ({ sendSms: vi.fn(async () => ({ success: true })) }));
vi.mock("@/lib/sms", () => ({ sendSms }));

const URL = "http://localhost/api/packs/notify-created";

const PACK = {
  id: "pack1", player_id: "p1", academy_id: "ac1",
  total_sessions: 10, fee_per_session: 20, payment_status: "Pending", payment_due_date: "2026-09-20",
};
const PLAYER = { name: "Alice Bowler", email: "alice@example.com", phone: "0412345678" };
const ACADEMY = { name: "Fast Bowlers Academy", currency: "aud" };

describe("POST /api/packs/notify-created", () => {
  afterEach(() => {
    sendMail.mockClear();
    sendSms.mockClear();
  });

  test("400 when packId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { packId: "pack1" }));
    expect(res.status).toBe(401);
  });

  test("404 when the membership doesn't exist", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { session_packs: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { packId: "bogus" }));
    expect(res.status).toBe(404);
  });

  test("403 for a player/parent who isn't the one this membership belongs to", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    routeMockState.tableResponses = { session_packs: { data: PACK, error: null } };
    const res = await POST(jsonRequest(URL, { packId: "pack1" }));
    expect(res.status).toBe(403);
  });

  test("no-ops without sending anything when the pack is already Paid", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { session_packs: { data: { ...PACK, payment_status: "Paid" }, error: null } };

    const res = await POST(jsonRequest(URL, { packId: "pack1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, emailSent: false, smsSent: false });
    expect(sendMail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });

  test("emails and SMSs the player about a new Pending membership", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      session_packs: { data: PACK, error: null },
      players: { data: PLAYER, error: null },
      academies: { data: ACADEMY, error: null },
    };

    const res = await POST(jsonRequest(URL, { packId: "pack1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, emailSent: true, smsSent: true });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      to: "alice@example.com", subject: "Your new CRIC HQ membership — payment due",
    });
    expect(sendSms).toHaveBeenCalledWith("0412345678", expect.stringContaining("AUD 200"));
  });

  test("still sends the SMS even when Gmail isn't configured", async () => {
    vi.stubEnv("GMAIL_USER", "");
    try {
      routeMockState.cookieUser = rawUser({ role: "platform_admin" });
      routeMockState.tableResponses = {
        session_packs: { data: PACK, error: null },
        players: { data: PLAYER, error: null },
        academies: { data: ACADEMY, error: null },
      };

      const res = await POST(jsonRequest(URL, { packId: "pack1" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ success: true, emailSent: false, smsSent: true });
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
