import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import Stripe from "stripe";
import { POST } from "@/app/api/stripe/webhook/route";
import { stripe } from "@/lib/stripe";
import { routeMockState } from "../../setup/api";

const WEBHOOK_SECRET = "whsec_test_secret_for_local_signing";

function signedRequest(eventBody: Record<string, unknown>): Request {
  const payload = JSON.stringify(eventBody);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body: payload,
  });
}

function event(type: string, object: Record<string, unknown>) {
  return { id: "evt_test", type, data: { object } };
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test("500 when STRIPE_WEBHOOK_SECRET is unset", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const res = await POST(signedRequest(event("account.updated", {})));
    expect(res.status).toBe(500);
  });

  test("500 when STRIPE_WEBHOOK_SECRET is still the placeholder", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "REPLACE_ME_FROM_STRIPE_DASHBOARD");
    const res = await POST(signedRequest(event("account.updated", {})));
    expect(res.status).toBe(500);
  });

  test("400 when the signature doesn't verify", async () => {
    const payload = JSON.stringify(event("account.updated", {}));
    const res = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=bogus" },
        body: payload,
      }),
    );
    expect(res.status).toBe(400);
  });

  test("checkout.session.completed / pack_payment marks the pack Paid", async () => {
    const res = await POST(signedRequest(event("checkout.session.completed", { metadata: { type: "pack_payment", pack_id: "pack1" } })));
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.session_packs.update).toHaveBeenCalledWith({ payment_status: "Paid" });
    expect(client.tables.session_packs.eq).toHaveBeenCalledWith("id", "pack1");
  });

  test("checkout.session.completed / booking_payment marks the booking Paid", async () => {
    const res = await POST(signedRequest(event("checkout.session.completed", { metadata: { type: "booking_payment", booking_id: "b1" } })));
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.bookings.update).toHaveBeenCalledWith({ payment_status: "Paid" });
  });

  test("checkout.session.completed / assessment_payment increments assessment_credits", async () => {
    routeMockState.tableResponses = { players: { data: { assessment_credits: 2 }, error: null } };
    const res = await POST(signedRequest(event("checkout.session.completed", { metadata: { type: "assessment_payment", player_id: "p1" } })));
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).toHaveBeenCalledWith({ assessment_credits: 3 });
  });

  test("checkout.session.completed / library_subscription updates the player's library status", async () => {
    vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue({ id: "sub_lib1", status: "active" } as unknown as Stripe.Response<Stripe.Subscription>);

    const res = await POST(
      signedRequest(event("checkout.session.completed", { metadata: { type: "library_subscription", player_id: "p1" }, subscription: "sub_lib1" })),
    );
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).toHaveBeenCalledWith({ library_stripe_subscription_id: "sub_lib1", library_subscription_status: "active" });
  });

  test("checkout.session.completed / academy_subscription sets access_expires_at from the plan's access window", async () => {
    vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue({ id: "sub_ac1", status: "active" } as unknown as Stripe.Response<Stripe.Subscription>);
    routeMockState.tableResponses = { plans: { data: { access_duration_months: 3 }, error: null } };

    const res = await POST(
      signedRequest(event("checkout.session.completed", {
        metadata: { type: "academy_subscription", academy_id: "ac1", plan_id: "plan1" },
        subscription: "sub_ac1",
        customer: "cus_ac1",
      })),
    );
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.academies.update).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_subscription_id: "sub_ac1", subscription_status: "active", plan_id: "plan1", access_expires_at: expect.any(String) }),
    );
  });

  test("checkout.session.completed / player subscription sets the plan and billing period", async () => {
    const periodStart = 1_700_000_000;
    const periodEnd = 1_702_600_000;
    vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue({
      id: "sub_p1", status: "active", metadata: { plan: "Player Pro" },
      items: { data: [{ current_period_start: periodStart, current_period_end: periodEnd }] },
    } as unknown as Stripe.Response<Stripe.Subscription>);

    const res = await POST(
      signedRequest(event("checkout.session.completed", { client_reference_id: "p1", subscription: "sub_p1", customer: "cus_p1" })),
    );
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_customer_id: "cus_p1", stripe_subscription_id: "sub_p1", sub_plan: "Player Pro" }),
    );
  });

  test("customer.subscription.updated / library updates by stripe_subscription_id lookup", async () => {
    const res = await POST(
      signedRequest(event("customer.subscription.updated", { id: "sub_lib1", status: "past_due", metadata: { type: "library_subscription" } })),
    );
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).toHaveBeenCalledWith({ library_subscription_status: "past_due" });
    expect(client.tables.players.eq).toHaveBeenCalledWith("library_stripe_subscription_id", "sub_lib1");
  });

  test("customer.subscription.updated / academy updates the academy's subscription_status", async () => {
    const res = await POST(
      signedRequest(event("customer.subscription.updated", { id: "sub_ac1", status: "active", metadata: { type: "academy_subscription" } })),
    );
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.academies.update).toHaveBeenCalledWith({ subscription_status: "active" });
  });

  test("customer.subscription.updated / active player subscription keeps the plan, clears the session limit", async () => {
    const res = await POST(
      signedRequest(event("customer.subscription.updated", {
        id: "sub_p1", status: "active", metadata: { plan: "Coach Pro" },
        items: { data: [{ current_period_end: 1_702_600_000 }] },
      })),
    );
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).toHaveBeenCalledWith(
      expect.objectContaining({ subscription_status: "active", sub_plan: "Coach Pro", sub_sessions_limit: null }),
    );
  });

  test("customer.subscription.updated / inactive (past_due) player subscription reverts to Free with the 4-session cap", async () => {
    const res = await POST(
      signedRequest(event("customer.subscription.updated", {
        id: "sub_p1", status: "past_due", metadata: {},
        items: { data: [{ current_period_end: 1_702_600_000 }] },
      })),
    );
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).toHaveBeenCalledWith(
      expect.objectContaining({ subscription_status: "past_due", sub_plan: "Free", sub_sessions_limit: 4 }),
    );
  });

  test("customer.subscription.deleted / player subscription resets to Free and clears the subscription id", async () => {
    const res = await POST(signedRequest(event("customer.subscription.deleted", { id: "sub_p1", metadata: {} })));
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).toHaveBeenCalledWith({
      sub_plan: "Free", subscription_status: "canceled", sub_sessions_limit: 4, stripe_subscription_id: null,
    });
  });

  test("customer.subscription.deleted / academy subscription clears the academy's plan", async () => {
    const res = await POST(signedRequest(event("customer.subscription.deleted", { id: "sub_ac1", metadata: { type: "academy_subscription" } })));
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.academies.update).toHaveBeenCalledWith({
      subscription_status: "canceled", stripe_subscription_id: null, plan_id: null, access_expires_at: null,
    });
  });

  test("account.updated marks a coach onboarded once both charges and payouts are enabled", async () => {
    const res = await POST(
      signedRequest(event("account.updated", { id: "acct_1", charges_enabled: true, payouts_enabled: true })),
    );
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.coaches.update).toHaveBeenCalledWith({ stripe_connect_onboarded: true });
  });

  test("account.updated leaves a coach not-onboarded while payouts aren't enabled yet", async () => {
    const res = await POST(
      signedRequest(event("account.updated", { id: "acct_1", charges_enabled: true, payouts_enabled: false })),
    );
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.coaches.update).toHaveBeenCalledWith({ stripe_connect_onboarded: false });
  });

  test("invoice.payment_failed marks the player's subscription past_due", async () => {
    const res = await POST(
      signedRequest(event("invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_p1" } } })),
    );
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.players.update).toHaveBeenCalledWith({ subscription_status: "past_due" });
    expect(client.tables.players.eq).toHaveBeenCalledWith("stripe_subscription_id", "sub_p1");
  });

  test("an unhandled event type is still acknowledged with 200", async () => {
    const res = await POST(signedRequest(event("payment_intent.succeeded", {})));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ received: true });
  });
});
