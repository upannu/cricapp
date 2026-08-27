import { describe, expect, test, vi, afterEach } from "vitest";
import { POST } from "@/app/api/cron/pack-reminders/route";
import { routeMockState } from "../../setup/api";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn(async (_opts: Record<string, unknown>) => ({})) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const { sendSms } = vi.hoisted(() => ({ sendSms: vi.fn(async () => ({ success: true })) }));
vi.mock("@/lib/sms", () => ({ sendSms }));

function req(bearer?: string): Request {
  return new Request("http://localhost/api/cron/pack-reminders", {
    method: "POST",
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });
}

// Builds the date string from LOCAL date components, not .toISOString() (which
// converts to UTC and can shift the calendar date by a day depending on the
// machine's timezone) — matches what the route's own
// `new Date(dueDateIso); due.setHours(0,0,0,0)` ultimately reinterprets as a
// local calendar day on this same machine.
function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const PLAYER = { id: "p1", name: "Test Player", email: "player@example.com", phone: "0412345678", coach_id: null, login_disabled: false };

describe("POST /api/cron/pack-reminders", () => {
  afterEach(() => {
    sendMail.mockClear();
    sendSms.mockClear();
  });

  test("500 when CRON_SECRET isn't configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    try {
      const res = await POST(req());
      expect(res.status).toBe(500);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("401 when the bearer token is wrong", async () => {
    const res = await POST(req("wrong-secret"));
    expect(res.status).toBe(401);
  });

  test("500 when Gmail isn't configured", async () => {
    vi.stubEnv("GMAIL_USER", "");
    try {
      const res = await POST(req(process.env.CRON_SECRET));
      expect(res.status).toBe(500);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("sends the 7-day reminder once and records it", async () => {
    routeMockState.tableResponses = {
      session_packs: { data: [{ id: "pk1", player_id: "p1", academy_id: "ac1", payment_status: "Pending", payment_due_date: isoDaysFromToday(7), reminder_7d_sent_at: null }], error: null },
      players: { data: PLAYER, error: null },
    };

    const res = await POST(req(process.env.CRON_SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual([{ packId: "pk1", action: "reminder_7d_sent" }]);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ subject: "Your session pack payment is due in 1 week" });

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.session_packs.update).toHaveBeenCalledWith(expect.objectContaining({ reminder_7d_sent_at: expect.any(String) }));
  });

  test("does not resend the 7-day reminder once already sent", async () => {
    routeMockState.tableResponses = {
      session_packs: { data: [{ id: "pk1", player_id: "p1", academy_id: "ac1", payment_status: "Pending", payment_due_date: isoDaysFromToday(7), reminder_7d_sent_at: "2026-01-01T00:00:00Z" }], error: null },
      players: { data: PLAYER, error: null },
    };

    const res = await POST(req(process.env.CRON_SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(sendMail).not.toHaveBeenCalled();
  });

  test("sends the 2-day reminder", async () => {
    routeMockState.tableResponses = {
      session_packs: { data: [{ id: "pk1", player_id: "p1", academy_id: "ac1", payment_status: "Pending", payment_due_date: isoDaysFromToday(2), reminder_2d_sent_at: null }], error: null },
      players: { data: PLAYER, error: null },
    };

    const res = await POST(req(process.env.CRON_SECRET));
    const body = await res.json();

    expect(body.results).toEqual([{ packId: "pk1", action: "reminder_2d_sent" }]);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ subject: "Your session pack payment is due in 2 days" });
  });

  test("due-today notice emails and SMS-notifies both the player and their coach", async () => {
    routeMockState.tableResponses = {
      session_packs: { data: [{ id: "pk1", player_id: "p1", academy_id: "ac1", payment_status: "Pending", payment_due_date: isoDaysFromToday(0), reminder_due_sent_at: null }], error: null },
      players: { data: { ...PLAYER, coach_id: "coach1" }, error: null },
      coaches: { data: { name: "Coach Dan", email: "coach@example.com", phone: "0498765432" }, error: null },
    };

    const res = await POST(req(process.env.CRON_SECRET));
    const body = await res.json();

    expect(body.results).toEqual([{ packId: "pk1", action: "reminder_due_sent" }]);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ subject: "Your session pack payment is due today", cc: "coach@example.com" });
    // One SMS to the player, one to the resolved coach.
    expect(sendSms).toHaveBeenCalledTimes(2);
    expect(sendSms).toHaveBeenCalledWith("0412345678", expect.stringContaining("due today"));
    expect(sendSms).toHaveBeenCalledWith("0498765432", expect.stringContaining("Test Player"));
  });

  test("marks an overdue-but-within-grace pack Overdue without disabling login", async () => {
    routeMockState.tableResponses = {
      session_packs: { data: [{ id: "pk1", player_id: "p1", academy_id: "ac1", payment_status: "Pending", payment_due_date: isoDaysFromToday(-3), reminder_due_sent_at: "x" }], error: null },
      players: { data: PLAYER, error: null },
    };

    const res = await POST(req(process.env.CRON_SECRET));
    const body = await res.json();

    expect(body.results).toEqual([{ packId: "pk1", action: "marked_overdue" }]);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.session_packs.update).toHaveBeenCalledWith({ payment_status: "Overdue" });
    expect(client.tables.players.update).not.toHaveBeenCalled();
  });

  test("disables login after the 7-day grace period and notifies player, coach, and platform admin", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAIL", "admin@example.com");
    try {
      routeMockState.tableResponses = {
        session_packs: { data: [{ id: "pk1", player_id: "p1", academy_id: "ac1", payment_status: "Overdue", payment_due_date: isoDaysFromToday(-7) }], error: null },
        players: { data: { ...PLAYER, coach_id: "coach1" }, error: null },
        coaches: { data: { name: "Coach Dan", email: "coach@example.com", phone: "0498765432" }, error: null },
      };

      const res = await POST(req(process.env.CRON_SECRET));
      const body = await res.json();

      expect(body.results).toEqual(expect.arrayContaining([{ packId: "pk1", action: "login_disabled" }]));
      const client = routeMockState.lastServiceClient!;
      expect(client.tables.players.update).toHaveBeenCalledWith(
        expect.objectContaining({ login_disabled: true, disabled_reason: "Overdue session pack payment" }),
      );
      // Player + coach + platform admin = 3 lock-notice emails.
      expect(sendMail).toHaveBeenCalledTimes(3);
      const recipients = sendMail.mock.calls.map((c) => c[0].to);
      expect(recipients).toEqual(expect.arrayContaining(["player@example.com", "coach@example.com", "admin@example.com"]));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("skips a pack whose player has no email on file", async () => {
    routeMockState.tableResponses = {
      session_packs: { data: [{ id: "pk1", player_id: "p1", academy_id: "ac1", payment_status: "Pending", payment_due_date: isoDaysFromToday(7), reminder_7d_sent_at: null }], error: null },
      players: { data: { ...PLAYER, email: "" }, error: null },
    };

    const res = await POST(req(process.env.CRON_SECRET));
    const body = await res.json();

    expect(body.results).toEqual([]);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
