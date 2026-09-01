import { describe, expect, test, vi, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { POST } from "@/app/api/geocode/route";
import { jsonRequest } from "../mocks/caller";
import { handlers } from "../mocks/msw-handlers";

// Scoped to this file only — see tests/setup/api.ts for why MSW isn't wired
// up globally for the "api" project (it hangs the Stripe SDK's real calls).
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers(...handlers));
afterAll(() => server.close());

const URL = "http://localhost/api/geocode";

describe("POST /api/geocode", () => {
  test("400 when address is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("500 when Google Maps isn't configured", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    try {
      const res = await POST(jsonRequest(URL, { address: "Sydney" }));
      expect(res.status).toBe(500);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("returns lat/lng for a resolvable address", async () => {
    const res = await POST(jsonRequest(URL, { address: "Sydney, Australia" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ lat: -33.8688, lng: 151.2093, formattedAddress: "123 Test St, Sydney NSW, Australia" });
  });

  test("404 when Google returns no results", async () => {
    server.use(
      http.get("https://maps.googleapis.com/maps/api/geocode/json", () =>
        HttpResponse.json({ status: "ZERO_RESULTS", results: [] }),
      ),
    );

    const res = await POST(jsonRequest(URL, { address: "Nowhere in particular" }));
    expect(res.status).toBe(404);
  });
});
