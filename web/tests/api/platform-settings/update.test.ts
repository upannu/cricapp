import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/platform-settings/update/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/platform-settings/update";

describe("POST /api/platform-settings/update", () => {
  test("400 when either price is missing or not positive", async () => {
    const res = await POST(jsonRequest(URL, { playerProPriceAud: 9.99, coachProPriceAud: -1 }));
    expect(res.status).toBe(400);
  });

  test("403 when the caller is not a platform admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    const res = await POST(jsonRequest(URL, { playerProPriceAud: 9.99, coachProPriceAud: 29.99 }));
    expect(res.status).toBe(403);
  });

  test("updates the default platform settings row", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    const res = await POST(jsonRequest(URL, { playerProPriceAud: 12.99, coachProPriceAud: 34.99 }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.platform_settings.update).toHaveBeenCalledWith(
      expect.objectContaining({ player_pro_price_aud: 12.99, coach_pro_price_aud: 34.99 }),
    );
    expect(client.tables.platform_settings.eq).toHaveBeenCalledWith("id", "default");
  });

  test("500 when the update fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { platform_settings: { data: null, error: { message: "db down" } } };
    const res = await POST(jsonRequest(URL, { playerProPriceAud: 9.99, coachProPriceAud: 29.99 }));
    expect(res.status).toBe(500);
  });
});
