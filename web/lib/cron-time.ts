/** Every academy on the platform is Australian, but the deployed server's own clock is not
 * guaranteed to be — Vercel/Hostinger containers commonly default to UTC regardless of where the
 * app is used. Session/booking times are entered by staff in local Sydney time with no stored
 * timezone, so "today" and "hours until start" are computed against Australia/Sydney explicitly
 * rather than trusting the server process's own timezone (this exact class of bug already bit the
 * payment-reminder cron's own testing once). Shared by every reminder cron. */
export const ACADEMY_TZ = "Australia/Sydney";
export const DAY_TOKENS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function sydneyNowParts(now: Date) {
  const fmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: ACADEMY_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    dateIso: `${get("year")}-${get("month")}-${get("day")}`,
    hour: get("hour"), minute: get("minute"), second: get("second"),
  };
}

/** The UTC offset (ms) Sydney is currently sitting at — varies AEST/AEDT across the year, so this
 * is computed live rather than hardcoded. */
export function sydneyOffsetMs(now: Date): number {
  const p = sydneyNowParts(now);
  const asIfUtc = new Date(`${p.dateIso}T${p.hour}:${p.minute}:${p.second}Z`);
  return asIfUtc.getTime() - now.getTime();
}

/** Converts a Sydney-local "HH:mm" on a given Sydney-local date into the real UTC instant it
 * represents, correctly accounting for daylight saving on that specific date. */
export function sydneyLocalToInstant(dateIso: string, hhmm: string, offsetMs: number): Date {
  const asIfUtc = new Date(`${dateIso}T${hhmm}:00Z`);
  return new Date(asIfUtc.getTime() - offsetMs);
}
