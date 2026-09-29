import { describe, expect, test } from "vitest";
import { GET } from "@/app/api/admin/finance-summary/route";
import { routeMockState } from "../../setup/api";
import { rawUser } from "../../mocks/caller";

describe("GET /api/admin/finance-summary", () => {
  test("403 when not signed in", async () => {
    const res = await GET();
    expect(res.status).toBe(403);
  });

  test("403 when the caller is not a platform admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  test("combines the Stripe ledger and the cash fee-due ledgers into one overall/byAcademy/recentMonths summary", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      platform_revenue_events: {
        data: [
          { academy_id: "ac1", amount_aud: 200, platform_fee_aud: 20, currency: "aud", created_at: "2026-09-15T00:00:00Z" },
          { academy_id: "ac1", amount_aud: 100, platform_fee_aud: 10, currency: "aud", created_at: "2026-08-10T00:00:00Z" },
          { academy_id: "ac2", amount_aud: 50, platform_fee_aud: 5, currency: "aud", created_at: "2026-09-20T00:00:00Z" },
        ],
        error: null,
      },
      pack_fee_dues: { data: [{ academy_id: "ac1", amount_aud: 15, status: "pending" }], error: null },
      booking_fee_dues: { data: [{ academy_id: "ac2", amount_aud: 8, status: "collected" }], error: null },
      academies: {
        data: [
          { id: "ac1", name: "Western Suburbs Academy", currency: "aud" },
          { id: "ac2", name: "Northside Cricket", currency: "aud" },
        ],
        error: null,
      },
    };

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.overall).toEqual([
      { currency: "aud", grossAud: 350, stripeFeeAud: 35, cashPendingAud: 15, cashCollectedAud: 8 },
    ]);
    expect(body.byAcademy).toEqual(
      expect.arrayContaining([
        {
          academyId: "ac1", academyName: "Western Suburbs Academy",
          totals: [{ currency: "aud", grossAud: 300, stripeFeeAud: 30, cashPendingAud: 15, cashCollectedAud: 0 }],
        },
        {
          academyId: "ac2", academyName: "Northside Cricket",
          totals: [{ currency: "aud", grossAud: 50, stripeFeeAud: 5, cashPendingAud: 0, cashCollectedAud: 8 }],
        },
      ]),
    );
    expect(body.byAcademy).toHaveLength(2);
    // Newest month first, and each event's own created_at (not "today") buckets it.
    expect(body.recentMonths).toEqual([
      { month: "2026-09", totals: [{ currency: "aud", grossAud: 250, stripeFeeAud: 25, cashPendingAud: 0, cashCollectedAud: 0 }] },
      { month: "2026-08", totals: [{ currency: "aud", grossAud: 100, stripeFeeAud: 10, cashPendingAud: 0, cashCollectedAud: 0 }] },
    ]);
  });

  // A cash fee-due row has no currency column of its own (unlike platform_revenue_events, which
  // captures currency at payment time) — the route must resolve it from the owning academy rather
  // than defaulting everything to AUD regardless of the academy's real currency.
  test("resolves cash fee-due currency from the owning academy, not a hardcoded default", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      platform_revenue_events: { data: [], error: null },
      pack_fee_dues: { data: [{ academy_id: "ac1", amount_aud: 40, status: "pending" }], error: null },
      booking_fee_dues: { data: [], error: null },
      academies: { data: [{ id: "ac1", name: "NZ Academy", currency: "nzd" }], error: null },
    };

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.overall).toEqual([
      { currency: "nzd", grossAud: 0, stripeFeeAud: 0, cashPendingAud: 40, cashCollectedAud: 0 },
    ]);
  });

  test("an academy with no activity at all doesn't appear in byAcademy", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      platform_revenue_events: { data: [], error: null },
      pack_fee_dues: { data: [], error: null },
      booking_fee_dues: { data: [], error: null },
      academies: { data: [{ id: "ac1", name: "Quiet Academy", currency: "aud" }], error: null },
    };

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.overall).toEqual([]);
    expect(body.byAcademy).toEqual([]);
    expect(body.recentMonths).toEqual([]);
  });
});
