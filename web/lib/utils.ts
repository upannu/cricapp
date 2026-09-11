import type { Academy, Coach, Player, PlayerStatus, BookingType, Plan, SessionPack } from './types';

/** Great-circle distance in km between two lat/lng points (Haversine formula). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function getPlayerStatus(endDate: string): PlayerStatus {
  const daysLeft = (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysLeft < 0) return 'Expired';
  if (daysLeft <= 7) return 'Expiring';
  return 'Active';
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0] ?? '')
    .join('');
}

export function getReportPdfUrl(playerId: string, reportId: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/session-reports/${playerId}/${reportId}.pdf`;
}

/** Every academy on this platform is Australian, so a session's date/time is always shown in
 * Australia/Sydney regardless of where this renders — a server component renders on a UTC
 * process, and a viewer's own device could be set to any timezone, neither of which is the
 * timezone the session actually happened in. Pinning it explicitly avoids both. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' });
  const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' });
  return `${datePart} at ${timePart}`;
}

// Coach takes priority over academy. Tried the reverse — academy first, coach as fallback — on
// the reasoning that academy affiliation is the more stable identity; in practice this made the
// Coach column (and every other place this label is shown, e.g. player-profile's own "Coach"
// row) go blind to coach reassignment for any player who belongs to an academy, since the same
// academy name displays no matter which coach they're actually assigned to — confirmed live: a
// coach reassignment for a player with an academy silently stopped showing anywhere, even though
// the underlying coach_id genuinely changed. A field literally labeled "Coach" needs to actually
// reflect the coach; academy only stands in for a player with none at all (an independent coach's
// own roster has no academy to fall back to).
export function getCoachOrAcademyLabel(player: Player, coaches: Coach[], academies: Academy[]): string {
  const coach = player.coachId ? coaches.find((c) => c.id === player.coachId) : undefined;
  if (coach) return coach.name;
  const academy = academies.find((a) => a.playerIds.includes(player.id));
  return academy ? academy.name : 'Unassigned';
}

/** Pricing lives on the Academy, not the Coach — a coach's fee for a session is whatever their
 * academy charges for that session type, unless the academy's own plan waives player session
 * fees entirely (e.g. a cricket board license), in which case it's always free. */
export function getSessionFee(coach: Coach | undefined, academies: Academy[], type: BookingType, plans: Plan[] = []): number {
  if (!coach) return 0;
  const academy = academies.find((a) => a.id === coach.academyId);
  if (academy?.planId) {
    const plan = plans.find((p) => p.id === academy.planId);
    if (plan?.waivesSessionFees) return 0;
  }
  return academy?.sessionTypeFees[type] ?? academy?.sessionFeeAud ?? 0;
}

/** Share of session-pack/booking revenue the platform takes for this academy — 10% unless its
 * assigned plan overrides it (e.g. an academy paying well upfront gets a reduced rate). */
export function getPlatformFeePercent(academyId: string, academies: Academy[], plans: Plan[] = []): number {
  const academy = academies.find((a) => a.id === academyId);
  if (academy?.planId) {
    const plan = plans.find((p) => p.id === academy.planId);
    if (plan?.platformFeePercent != null) return plan.platformFeePercent;
  }
  return 10;
}

/** Weeks a pack is expected to run at its agreed pace — e.g. 10 sessions at 1 day/week ≈ 10 weeks.
 * Falls back to one session per week if no days were agreed (shouldn't happen for a new pack, but
 * older/grandfathered packs may have an empty agreedDays). */
export function packPaceWeeks(pack: Pick<SessionPack, "totalSessions" | "agreedDays">): number {
  const daysPerWeek = pack.agreedDays.length || 1;
  return Math.ceil(pack.totalSessions / daysPerWeek);
}

/** The date after which a coach-issued credit on this pack can no longer be used — the player's
 * own agreed weekly schedule, not an arbitrary grace period, is what "within those N weeks" means. */
export function packCreditExpiryDate(pack: Pick<SessionPack, "purchaseDate" | "totalSessions" | "agreedDays">): Date {
  const end = new Date(pack.purchaseDate);
  end.setDate(end.getDate() + packPaceWeeks(pack) * 7);
  return end;
}

/** True once a pack's agreed-pace window has passed — any sessionCredits still sitting unused at
 * that point expire rather than carrying forward indefinitely. */
export function isPackCreditExpired(pack: Pick<SessionPack, "purchaseDate" | "totalSessions" | "agreedDays">): boolean {
  return new Date() > packCreditExpiryDate(pack);
}

/** Resolves a CSV row's free-text player column (name or email) to a real player — shared by every
 * bulk-CSV importer so a spreadsheet exported with either column still matches. Email is checked
 * first since it's unique; name is a same-academy convenience fallback. */
export function matchPlayerByNameOrEmail(players: Player[], value: string): Player | undefined {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  return players.find((p) => p.email.trim().toLowerCase() === v)
      ?? players.find((p) => p.name.trim().toLowerCase() === v);
}

/** Every occurrence date for a weekly recurring group between two ISO dates, inclusive. Shared by
 * Attendance (building each group's full past-occurrence history) and the player Portal (finding
 * a player's next squad training dates) — both need the same weekly-recurrence math.
 *
 * Renders each occurrence from the cursor's own local date parts, not toISOString() — every
 * academy on this platform is Australian (ahead of UTC), so a local midnight converted via
 * toISOString() lands on the *previous* UTC calendar day, silently shifting every returned date
 * back by one in any browser actually running this. Caught while adding a new caller; fixing it
 * here also corrects Attendance's own "upcoming" date chips, which had the same off-by-one. */
export function occurrenceDatesInRange(dayOfWeek: number, fromIso: string, toIso: string): string[] {
  const dates: string[] = [];
  const from = new Date(fromIso + 'T00:00:00');
  const to = new Date(toIso + 'T00:00:00');
  const cursor = new Date(from);
  const offset = (dayOfWeek - cursor.getDay() + 7) % 7;
  cursor.setDate(cursor.getDate() + offset);
  while (cursor <= to) {
    dates.push(localIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return dates;
}

function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Deliberately loose shape check (something@something.something), not full RFC 5322 — the point
 * isn't to reject every technically-invalid address, it's to catch the case that actually happens
 * (a name or fragment typed into the email field by mistake, with no "@" at all) before it saves a
 * player record that self-serve signup's exact-match player lookup can then never find. Every
 * player-creation entry point (the Players page quick-add, an academy's inline "+ Add Player", and
 * CSV import row validation) shares this one check so none of them can drift out of sync with it. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
