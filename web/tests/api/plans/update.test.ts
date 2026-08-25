import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/plans/update/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/plans/update";
const VALID_INPUT = { slug: "board-license", name: "Board License", audience: "organization", billingType: "subscription", billingInterval: "year", priceAud: 500 };

describe("POST /api/plans/update", () => {
  test("400 when required fields are missing or invalid", async () => {
    const res = await POST(jsonRequest(URL, { slug: "x" }));
    expect(res.status).toBe(400);
  });

  test("400 when a subscription plan has no billing interval", async () => {
    const res = await POST(jsonRequest(URL, { ...VALID_INPUT, billingInterval: undefined }));
    expect(res.status).toBe(400);
  });

  test("400 when a one_time plan is given a billing interval", async () => {
    const res = await POST(jsonRequest(URL, { ...VALID_INPUT, billingType: "one_time", billingInterval: "month" }));
    expect(res.status).toBe(400);
  });

  test("400 when platformFeePercent is out of range", async () => {
    const res = await POST(jsonRequest(URL, { ...VALID_INPUT, platformFeePercent: 150 }));
    expect(res.status).toBe(400);
  });

  test("403 when the caller is not a platform admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    const res = await POST(jsonRequest(URL, VALID_INPUT));
    expect(res.status).toBe(403);
  });

  // Unlike most routes here, this one has no distinct "not signed in" (401)
  // branch — an absent caller just fails the platform_admin role check, so an
  // unauthenticated request gets the same 403 as a signed-in non-admin.
  test("unauthenticated caller gets 403, not 401 (no separate auth-presence check)", async () => {
    const res = await POST(jsonRequest(URL, VALID_INPUT));
    expect(res.status).toBe(403);
  });

  test("inserts a new plan when no id is given", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { plans: { data: { id: "new-plan-id" }, error: null } };

    const res = await POST(jsonRequest(URL, VALID_INPUT));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, id: "new-plan-id" });
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.plans.insert).toHaveBeenCalledWith(expect.objectContaining({ slug: "board-license", billing_interval: "year" }));
  });

  test("updates an existing plan when an id is given", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });

    const res = await POST(jsonRequest(URL, { ...VALID_INPUT, id: "plan-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, id: "plan-1" });
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.plans.update).toHaveBeenCalledWith(expect.objectContaining({ slug: "board-license" }));
    expect(client.tables.plans.eq).toHaveBeenCalledWith("id", "plan-1");
  });
});
