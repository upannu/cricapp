import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";

export type InvoiceKind = "stripe_invoice" | "checkout_session";
export type InvoiceStatus = "paid" | "open" | "void" | "uncollectible" | "unpaid";

export interface NormalizedInvoice {
  kind: InvoiceKind;
  stripeId: string;
  invoiceNumber: string;
  date: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  description: string;
  paymentType: string;
  customerId: string;
}

const ONE_TIME_LABELS: Record<string, string> = {
  booking_payment: "Coaching session booking",
  pack_payment: "Session pack purchase",
  assessment_payment: "Individual Action Assessment",
};

function toIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

function deriveInvoiceNumber(stripeId: string): string {
  return `PACE-${stripeId.slice(-10).toUpperCase()}`;
}

function customerIdOf(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string {
  if (!customer) return "";
  return typeof customer === "string" ? customer : customer.id;
}

export function normalizeStripeInvoice(invoice: Stripe.Invoice): NormalizedInvoice {
  const subMeta = invoice.parent?.subscription_details?.metadata ?? {};
  let paymentType = "other";
  let description = invoice.lines.data[0]?.description ?? "Subscription payment";

  if (subMeta.type === "academy_subscription") {
    paymentType = "academy_subscription";
    description = invoice.lines.data[0]?.description ?? "Academy License";
  } else if (subMeta.type === "library_subscription") {
    paymentType = "library_subscription";
    description = "Library Access";
  } else if (subMeta.type === "coach_subscription") {
    paymentType = "coach_pro";
    description = "Coach Pro subscription";
  } else if (subMeta.plan === "Player Pro" || subMeta.plan === "Coach Pro") {
    paymentType = subMeta.plan === "Player Pro" ? "player_pro" : "coach_pro";
    description = `${subMeta.plan} subscription`;
  }

  const status: InvoiceStatus =
    invoice.status === "paid" || invoice.status === "open" ||
    invoice.status === "void" || invoice.status === "uncollectible"
      ? invoice.status
      : "unpaid";

  const amountCents = status === "paid" ? invoice.amount_paid : invoice.amount_due;

  return {
    kind: "stripe_invoice",
    stripeId: invoice.id ?? "",
    invoiceNumber: invoice.number ?? deriveInvoiceNumber(invoice.id ?? ""),
    date: toIso(invoice.created),
    amount: amountCents / 100,
    currency: invoice.currency,
    status,
    description,
    paymentType,
    customerId: customerIdOf(invoice.customer),
  };
}

export function normalizeCheckoutSession(session: Stripe.Checkout.Session): NormalizedInvoice {
  const paymentType = session.metadata?.type ?? "other";
  return {
    kind: "checkout_session",
    stripeId: session.id,
    invoiceNumber: deriveInvoiceNumber(session.id),
    date: toIso(session.created),
    amount: (session.amount_total ?? 0) / 100,
    currency: session.currency ?? "aud",
    status: "paid",
    description: ONE_TIME_LABELS[paymentType] ?? "One-time payment",
    paymentType,
    customerId: customerIdOf(session.customer),
  };
}

async function listAllInvoices(customerId: string): Promise<Stripe.Invoice[]> {
  const result: Stripe.Invoice[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 5; page++) {
    const batch = await stripe.invoices.list({ customer: customerId, limit: 100, starting_after: startingAfter });
    result.push(...batch.data.filter((inv) => inv.status !== "draft"));
    if (!batch.has_more) break;
    startingAfter = batch.data[batch.data.length - 1]?.id;
    if (!startingAfter) break;
  }
  return result;
}

async function listAllCheckoutSessions(customerId: string): Promise<Stripe.Checkout.Session[]> {
  const result: Stripe.Checkout.Session[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 5; page++) {
    const batch = await stripe.checkout.sessions.list({ customer: customerId, limit: 100, starting_after: startingAfter });
    // Subscription-mode sessions are excluded here — their invoice already shows up via
    // listAllInvoices, and including both would double-count the same purchase.
    result.push(...batch.data.filter((s) => s.mode === "payment" && s.status === "complete" && s.payment_status === "paid"));
    if (!batch.has_more) break;
    startingAfter = batch.data[batch.data.length - 1]?.id;
    if (!startingAfter) break;
  }
  return result;
}

/** Every payer (player or academy) reuses a single Stripe Customer across every payment they've
 * ever made, so one customer ID surfaces their entire history — subscription cycles as real
 * Stripe Invoice objects, one-time bookings/packs/assessments as completed Checkout Sessions
 * (no separate Invoice object exists for those unless invoice_creation was enabled, which it
 * isn't — Checkout Session metadata set at payment time is enough to identify what they were for). */
export async function listInvoicesForCustomer(customerId: string): Promise<NormalizedInvoice[]> {
  const [invoices, sessions] = await Promise.all([
    listAllInvoices(customerId),
    listAllCheckoutSessions(customerId),
  ]);
  const normalized = [
    ...invoices.map(normalizeStripeInvoice),
    ...sessions.map(normalizeCheckoutSession),
  ];
  normalized.sort((a, b) => b.date.localeCompare(a.date));
  return normalized;
}

export async function fetchSingleInvoice(kind: InvoiceKind, stripeId: string): Promise<NormalizedInvoice> {
  if (kind === "stripe_invoice") {
    const invoice = await stripe.invoices.retrieve(stripeId);
    return normalizeStripeInvoice(invoice);
  }
  const session = await stripe.checkout.sessions.retrieve(stripeId);
  return normalizeCheckoutSession(session);
}
