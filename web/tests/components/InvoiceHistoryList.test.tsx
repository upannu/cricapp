import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvoiceHistoryList } from "@/components/InvoiceHistoryList";
import type { NormalizedInvoice } from "@/lib/stripe-invoices";

const originalFetch = global.fetch;

function mockFetchOnce(response: unknown) {
  global.fetch = vi.fn().mockResolvedValue({ json: async () => response }) as typeof fetch;
}

const INVOICE: NormalizedInvoice = {
  kind: "checkout_session", stripeId: "cs_1", invoiceNumber: "PACE-1", date: "2026-01-01T00:00:00.000Z",
  amount: 40, currency: "aud", status: "paid", description: "Coaching session booking", paymentType: "booking_payment", customerId: "cus_1",
};

describe("InvoiceHistoryList", () => {
  test("fetches invoices scoped to the given player/id and renders them", async () => {
    mockFetchOnce({ invoices: [INVOICE] });

    render(<InvoiceHistoryList scope="player" id="p1" />);

    expect(await screen.findByText("Coaching session booking")).toBeInTheDocument();
    // formatMoney (lib/currency.ts) uses Intl.NumberFormat("en-AU", { style: "currency" }), which
    // renders AUD as a bare "$" with no trailing currency-code suffix.
    expect(screen.getByText("$40.00")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/stripe/invoices?playerId=p1");

    global.fetch = originalFetch;
  });

  test("shows an empty state with no invoices", async () => {
    mockFetchOnce({ invoices: [] });

    render(<InvoiceHistoryList scope="academy" id="ac1" />);

    expect(await screen.findByText("No invoices yet.")).toBeInTheDocument();
    global.fetch = originalFetch;
  });

  test("shows the server-provided error message", async () => {
    mockFetchOnce({ error: "You don't have access." });

    render(<InvoiceHistoryList scope="player" id="p1" />);

    expect(await screen.findByText("You don't have access.")).toBeInTheDocument();
    global.fetch = originalFetch;
  });
});
