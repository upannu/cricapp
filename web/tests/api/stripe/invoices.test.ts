import { describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/stripe/invoices/route";
import { routeMockState } from "../../setup/api";
import { rawUser } from "../../mocks/caller";
import type { NormalizedInvoice } from "@/lib/stripe-invoices";

const { listInvoicesForCustomer } = vi.hoisted(() => ({ listInvoicesForCustomer: vi.fn() }));
vi.mock("@/lib/stripe-invoices", () => ({ listInvoicesForCustomer }));

const SAMPLE_INVOICE: NormalizedInvoice = {
  kind: "checkout_session", stripeId: "cs_test1", invoiceNumber: "PACE-TEST1",
  date: "2026-01-01T00:00:00.000Z", amountAud: 40, currency: "aud", status: "paid",
  description: "Coaching session booking", paymentType: "booking_payment", customerId: "cus_1",
};

function req(query: string) {
  return new Request(`http://localhost/api/stripe/invoices?${query}`);
}

describe("GET /api/stripe/invoices", () => {
  test("400 when neither playerId nor academyId is given", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(400);
  });

  test("400 when both playerId and academyId are given", async () => {
    const res = await GET(req("playerId=p1&academyId=ac1"));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await GET(req("playerId=p1"));
    expect(res.status).toBe(401);
  });

  test("403 when caller cannot access the player", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    const res = await GET(req("playerId=p1"));
    expect(res.status).toBe(403);
  });

  test("returns an empty list when the player has no billing account yet", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: { stripe_customer_id: null }, error: null } };
    const res = await GET(req("playerId=p1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ invoices: [] });
  });

  test("returns the player's invoices", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: { stripe_customer_id: "cus_1" }, error: null } };
    listInvoicesForCustomer.mockResolvedValueOnce([SAMPLE_INVOICE]);

    const res = await GET(req("playerId=p1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.invoices).toEqual([SAMPLE_INVOICE]);
    expect(listInvoicesForCustomer).toHaveBeenCalledWith("cus_1");
  });

  test("403 when a non-admin, non-owning academy_admin requests academy invoices", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "someone-elses-academy" });
    const res = await GET(req("academyId=ac1"));
    expect(res.status).toBe(403);
  });

  test("returns the academy's invoices for its own academy_admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.tableResponses = { academies: { data: { stripe_customer_id: "cus_ac1" }, error: null } };
    listInvoicesForCustomer.mockResolvedValueOnce([SAMPLE_INVOICE]);

    const res = await GET(req("academyId=ac1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.invoices).toEqual([SAMPLE_INVOICE]);
  });
});
