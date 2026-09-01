import { http, HttpResponse } from "msw";

/** Default success responses for the two bare-fetch external APIs this app calls
 * directly (no SDK wrapper) — ClickSend SMS and Google Maps geocoding. Override
 * per-test with `server.use(...)` from tests/setup/api.ts's exported `mswServer`. */
export const handlers = [
  http.post("https://rest.clicksend.com/v3/sms/send", () =>
    HttpResponse.json({ response_code: "SUCCESS", data: { messages: [{ status: "SUCCESS" }] } }),
  ),
  http.get("https://maps.googleapis.com/maps/api/geocode/json", () =>
    HttpResponse.json({
      status: "OK",
      results: [{ formatted_address: "123 Test St, Sydney NSW, Australia", geometry: { location: { lat: -33.8688, lng: 151.2093 } } }],
    }),
  ),
];
