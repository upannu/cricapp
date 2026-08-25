import { describe, expect, test, vi } from "vitest";
import { POST } from "@/app/api/notify-admin-signup/route";
import { jsonRequest } from "../mocks/caller";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn(async (_opts: Record<string, unknown>) => ({})) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const URL = "http://localhost/api/notify-admin-signup";

describe("POST /api/notify-admin-signup", () => {
  test("silently succeeds (skipped) when email isn't configured", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAIL", "");
    try {
      const res = await POST(jsonRequest(URL, { name: "New Coach", email: "coach@example.com", role: "coach" }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({ success: true, skipped: true });
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("emails the platform admin about the new signup", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAIL", "admin@example.com");
    try {
      const res = await POST(jsonRequest(URL, { name: "New Coach", email: "coach@example.com", role: "coach" }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ success: true });
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail.mock.calls[0][0]).toMatchObject({ to: "admin@example.com", subject: expect.stringContaining("New Coach registration") });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("500 when sending fails", async () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAIL", "admin@example.com");
    sendMail.mockRejectedValueOnce(new Error("SMTP exploded"));
    try {
      const res = await POST(jsonRequest(URL, { name: "New Coach", email: "coach@example.com", role: "coach" }));
      expect(res.status).toBe(500);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
