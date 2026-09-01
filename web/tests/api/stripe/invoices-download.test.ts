import { describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/stripe/invoices/download/route";
import { routeMockState } from "../../setup/api";
import { rawUser } from "../../mocks/caller";
import type { NormalizedInvoice } from "@/lib/stripe-invoices";

const { fetchSingleInvoice } = vi.hoisted(() => ({ fetchSingleInvoice: vi.fn() }));
vi.mock("@/lib/stripe-invoices", () => ({ fetchSingleInvoice }));

const SAMPLE_INVOICE: NormalizedInvoice = {
  kind: "checkout_session", stripeId: "cs_test1", invoiceNumber: "PACE-TEST1",
  date: "2026-01-01T00:00:00.000Z", amount: 40, currency: "aud", status: "paid",
  description: "Coaching session booking", paymentType: "booking_payment", customerId: "cus_1",
};

function req(query: string) {
  return new Request(`http://localhost/api/stripe/invoices/download?${query}`);
}

const VALID_QUERY = "playerId=p1&kind=checkout_session&stripeId=cs_test1";

describe("GET /api/stripe/invoices/download", () => {
  test("400 when kind is invalid", async () => {
    const res = await GET(req("playerId=p1&kind=bogus&stripeId=cs_test1"));
    expect(res.status).toBe(400);
  });

  test("400 when stripeId is missing", async () => {
    const res = await GET(req("playerId=p1&kind=checkout_session"));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await GET(req(VALID_QUERY));
    expect(res.status).toBe(401);
  });

  test("403 when caller cannot access the player", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    const res = await GET(req(VALID_QUERY));
    expect(res.status).toBe(403);
  });

  test("404 when the player has no billing account", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: { stripe_customer_id: null, name: "P", email: null }, error: null } };
    const res = await GET(req(VALID_QUERY));
    expect(res.status).toBe(404);
  });

  test("403 when the invoice belongs to a different Stripe customer", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: { stripe_customer_id: "cus_1", name: "P", email: "p@example.com" }, error: null } };
    fetchSingleInvoice.mockResolvedValueOnce({ ...SAMPLE_INVOICE, customerId: "cus_someone_else" });

    const res = await GET(req(VALID_QUERY));
    expect(res.status).toBe(403);
  });

  test("404 when fetchSingleInvoice throws (invoice not found on Stripe)", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: { stripe_customer_id: "cus_1", name: "P", email: "p@example.com" }, error: null } };
    fetchSingleInvoice.mockRejectedValueOnce(new Error("No such checkout session"));

    const res = await GET(req(VALID_QUERY));
    expect(res.status).toBe(404);
  });

  test("streams back a real PDF for a matching invoice", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { players: { data: { stripe_customer_id: "cus_1", name: "Test Player", email: "p@example.com" }, error: null } };
    fetchSingleInvoice.mockResolvedValueOnce(SAMPLE_INVOICE);

    const res = await GET(req(VALID_QUERY));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("PACE-TEST1");
    const bytes = new Uint8Array(await res.arrayBuffer());
    // A real PDF starts with the "%PDF-" magic bytes.
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });
});
