// Multi-currency support — see the "Multi-currency support" plan. Deliberately starts with a
// small, explicit set rather than trying to cover every ISO currency: extending later is just
// adding entries to these two lists/maps, nothing structural.

export type Currency = "aud" | "usd" | "gbp" | "nzd";

export const SUPPORTED_CURRENCIES: Currency[] = ["aud", "usd", "gbp", "nzd"];

export const DEFAULT_CURRENCY: Currency = "aud";

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  aud: "A$",
  usd: "US$",
  gbp: "£",
  nzd: "NZ$",
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  aud: "Australian Dollar (AUD)",
  usd: "US Dollar (USD)",
  gbp: "British Pound (GBP)",
  nzd: "New Zealand Dollar (NZD)",
};

/** Countries an academy can be created in at launch, and the currency its Stripe Connect payout
 * account will use — currency is always derived from country, never picked independently, since
 * a Connect account's payout currency is tied to the country it was created with. */
export const COUNTRY_OPTIONS: { code: string; name: string; currency: Currency }[] = [
  { code: "AU", name: "Australia", currency: "aud" },
  { code: "NZ", name: "New Zealand", currency: "nzd" },
  { code: "GB", name: "United Kingdom", currency: "gbp" },
  { code: "US", name: "United States", currency: "usd" },
];

const COUNTRY_TO_CURRENCY: Record<string, Currency> = Object.fromEntries(
  COUNTRY_OPTIONS.map((c) => [c.code, c.currency]),
);

export function currencyForCountry(countryCode: string): Currency {
  return COUNTRY_TO_CURRENCY[countryCode] ?? DEFAULT_CURRENCY;
}

export function isSupportedCurrency(value: string | null | undefined): value is Currency {
  return !!value && (SUPPORTED_CURRENCIES as string[]).includes(value);
}

/** Resolves what to actually charge for a plan: the admin-set override price for `preferred`
 * currency if one exists, otherwise the AUD price in AUD. Shared by every plan-based Stripe
 * checkout route so "does this plan support the buyer's currency" is decided in exactly one
 * place. */
export function resolvePlanPrice(
  priceAud: number,
  pricesByCurrency: Partial<Record<Currency, number>> | null | undefined,
  preferred: string | null | undefined,
): { amount: number; currency: Currency } {
  if (isSupportedCurrency(preferred) && preferred !== DEFAULT_CURRENCY) {
    const override = pricesByCurrency?.[preferred];
    if (override != null) return { amount: override, currency: preferred };
  }
  return { amount: priceAud, currency: DEFAULT_CURRENCY };
}

/** The one shared money formatter — every UI amount should go through this rather than a
 * hand-rolled `$${x.toFixed(2)}` string, so a display is never silently wrong about which
 * currency it's actually showing. */
export function formatMoney(amount: number, currency: string = DEFAULT_CURRENCY): string {
  const code = isSupportedCurrency(currency) ? currency : DEFAULT_CURRENCY;
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: code.toUpperCase() }).format(amount);
  } catch {
    return `${CURRENCY_SYMBOLS[code]}${amount.toFixed(2)}`;
  }
}
