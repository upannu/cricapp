import { describe, expect, test, vi, afterEach } from "vitest";
import { POST } from "@/app/api/send-message/route";
import { jsonRequest } from "../mocks/caller";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn(async (_opts: Record<string, unknown>) => ({})) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const URL = "http://localhost/api/send-message";

describe("POST /api/send-message", () => {
  afterEach(() => {
    sendMail.mockClear();
  });

  test("400 when to or body is missing", async () => {
    const res = await POST(jsonRequest(URL, { to: "player@example.com" }));
    expect(res.status).toBe(400);
  });

  test("500 when email isn't configured", async () => {
    vi.stubEnv("GMAIL_USER", "");
    try {
      const res = await POST(jsonRequest(URL, { to: "player@example.com", body: "Hi" }));
      expect(res.status).toBe(500);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("sends the message with the given subject/fromName", async () => {
    const res = await POST(jsonRequest(URL, { to: "player@example.com", subject: "Reminder", body: "Don't forget training.", fromName: "Coach Dan" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "player@example.com", subject: "Reminder", text: "Don't forget training.", from: `"Coach Dan" <${process.env.GMAIL_USER}>` }),
    );
  });

  test("defaults subject and fromName when not given", async () => {
    const res = await POST(jsonRequest(URL, { to: "player@example.com", body: "Hi" }));
    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: "(No subject)", from: `"CRIC HQ" <${process.env.GMAIL_USER}>` }));
  });

  test("500 when sending fails", async () => {
    sendMail.mockRejectedValueOnce(new Error("SMTP exploded"));
    const res = await POST(jsonRequest(URL, { to: "player@example.com", body: "Hi" }));
    expect(res.status).toBe(500);
  });
});
