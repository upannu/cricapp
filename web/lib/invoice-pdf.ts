import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { NormalizedInvoice } from "@/lib/stripe-invoices";
import { formatMoney } from "@/lib/currency";

/** pdf-lib's standard fonts are WinAnsi-encoded and throw on characters outside Latin-1. */
function sanitizeForPdf(text: string): string {
  return text
    .replace(/⚠/g, "[!]")
    .replace(/✓/g, "[OK]")
    .replace(/ℹ/g, "[i]")
    .replace(/[^\x00-\xFF]/g, "");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric" });
}

const STATUS_LABELS: Record<string, string> = {
  paid: "PAID",
  open: "OPEN",
  void: "VOID",
  uncollectible: "UNCOLLECTIBLE",
  unpaid: "UNPAID",
};

export async function buildInvoicePdf(
  invoice: NormalizedInvoice,
  billedTo: { name: string; email: string | null },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const green = rgb(0.05, 0.65, 0.35);
  const dark = rgb(0.12, 0.12, 0.14);
  const gray = rgb(0.4, 0.4, 0.42);
  const statusColor = invoice.status === "paid" ? green : invoice.status === "open" ? rgb(0.85, 0.6, 0.1) : rgb(0.8, 0.2, 0.2);

  let y = 780;

  page.drawText("CRIC HQ", { x: 50, y, size: 22, font: bold, color: green });
  y -= 20;
  page.drawText("Invoice", { x: 50, y, size: 14, font, color: dark });
  y -= 45;

  page.drawText(`Invoice number: ${invoice.invoiceNumber}`, { x: 50, y, size: 11, font, color: gray });
  page.drawText(`Date: ${formatDate(invoice.date)}`, { x: 320, y, size: 11, font, color: gray });
  y -= 20;
  page.drawText("Status:", { x: 50, y, size: 11, font, color: gray });
  page.drawText(STATUS_LABELS[invoice.status] ?? invoice.status.toUpperCase(), { x: 95, y, size: 11, font: bold, color: statusColor });
  y -= 45;

  page.drawText("Billed To", { x: 50, y, size: 11, font: bold, color: dark });
  y -= 18;
  page.drawText(sanitizeForPdf(billedTo.name), { x: 50, y, size: 11, font, color: dark });
  y -= 16;
  if (billedTo.email) {
    page.drawText(sanitizeForPdf(billedTo.email), { x: 50, y, size: 11, font, color: gray });
    y -= 16;
  }
  y -= 24;

  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 22;
  page.drawText("Description", { x: 50, y, size: 10, font: bold, color: gray });
  page.drawText("Amount", { x: 470, y, size: 10, font: bold, color: gray });
  y -= 18;

  const amountText = sanitizeForPdf(formatMoney(invoice.amount, invoice.currency));
  page.drawText(sanitizeForPdf(invoice.description), { x: 50, y, size: 11, font, color: dark });
  page.drawText(amountText, { x: 470, y, size: 11, font, color: dark });
  y -= 20;

  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 24;
  page.drawText("Total", { x: 50, y, size: 12, font: bold, color: dark });
  page.drawText(amountText, { x: 470, y, size: 12, font: bold, color: dark });
  y -= 60;

  page.drawText("This is a computer-generated invoice from CRIC HQ.", { x: 50, y, size: 8, font, color: gray });
  if (invoice.kind === "checkout_session") {
    y -= 12;
    page.drawText("For payment method / receipt details, see your email receipt from Stripe at the time of purchase.", { x: 50, y, size: 8, font, color: gray });
  }

  return doc.save();
}
