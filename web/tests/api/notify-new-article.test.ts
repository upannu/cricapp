import { describe, expect, test, vi, afterEach } from "vitest";
import { POST } from "@/app/api/notify-new-article/route";
import { routeMockState } from "../setup/api";
import { rawUser, jsonRequest } from "../mocks/caller";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn(async (_opts: Record<string, unknown>) => ({})) }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const URL = "http://localhost/api/notify-new-article";

describe("POST /api/notify-new-article", () => {
  afterEach(() => {
    sendMail.mockClear();
  });

  test("400 when articleId is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("403 when the caller is not a platform admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "c1" });
    const res = await POST(jsonRequest(URL, { articleId: "a1" }));
    expect(res.status).toBe(403);
  });

  test("skips (success) silently when Gmail isn't configured", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    vi.stubEnv("GMAIL_USER", "");
    try {
      const res = await POST(jsonRequest(URL, { articleId: "a1" }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({ success: true, skipped: true });
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("404 when the article is not found", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { articles: { data: null, error: null } };
    const res = await POST(jsonRequest(URL, { articleId: "a1" }));
    expect(res.status).toBe(404);
  });

  test("skips when no players have an email on file", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      articles: { data: { title: "New Drill", stage: "Foundation" }, error: null },
      players: { data: [], error: null },
    };
    const res = await POST(jsonRequest(URL, { articleId: "a1" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe(true);
  });

  test("bcc-broadcasts to every unique player email", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      articles: { data: { title: "New Drill", stage: "Foundation" }, error: null },
      players: { data: [{ email: "a@example.com" }, { email: "b@example.com" }, { email: "a@example.com" }], error: null },
    };

    const res = await POST(jsonRequest(URL, { articleId: "a1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.recipientCount).toBe(2);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ bcc: ["a@example.com", "b@example.com"] });
  });
});
