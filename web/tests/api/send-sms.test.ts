import { describe, expect, test, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { POST } from "@/app/api/send-sms/route";
import { jsonRequest } from "../mocks/caller";
import { handlers } from "../mocks/msw-handlers";

// Scoped to this file only — see tests/setup/api.ts for why MSW isn't wired
// up globally for the "api" project.
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers(...handlers));
afterAll(() => server.close());

const URL = "http://localhost/api/send-sms";

describe("POST /api/send-sms", () => {
  test("400 when to or body is missing", async () => {
    const res = await POST(jsonRequest(URL, { to: "0412345678" }));
    expect(res.status).toBe(400);
  });

  test("sends successfully via ClickSend", async () => {
    const res = await POST(jsonRequest(URL, { to: "0412345678", body: "Your pack payment is due." }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
  });

  test("500 with ClickSend's error message when the send fails", async () => {
    server.use(
      http.post("https://rest.clicksend.com/v3/sms/send", () =>
        HttpResponse.json({ response_code: "FAILURE", response_msg: "Invalid number" }),
      ),
    );

    const res = await POST(jsonRequest(URL, { to: "0412345678", body: "Test" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Invalid number");
  });
});
