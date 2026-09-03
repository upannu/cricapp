// Freemium feature-gating — single source of truth for what each individual tier (Free / Player
// Pro / Coach Pro) unlocks. The tiers themselves are fixed (see `PlanTier`), but their limits and
// feature toggles are admin-editable Plan Catalog rows (`plan.locked === true`) — see
// /admin/plans. Every function here takes the caller's already-fetched `plans` list rather than
// querying itself, matching `getSessionFee`/`getPlatformFeePercent` in lib/utils.ts.
//
// A coach's own "Free" and a player's own "Free" are deliberately two separate Plan Catalog rows
// (slugs `free` vs `coach-free`) even though both show as "Free" in their respective pickers —
// an admin tightening the player Free tier's session cap shouldn't silently also change what an
// independent coach's Free roster cap is, and vice versa. `coach-pro` is shared as-is since it
// only ever means one thing (a coach's own paid plan).

import type { Academy, Coach, Player, Plan, PlanTier } from "./types";

const PLAYER_TIER_SLUGS: Record<PlanTier, string> = {
  Free: "free",
  "Player Pro": "player-pro",
  "Coach Pro": "coach-pro",
};

const COACH_TIER_SLUGS: Record<"Free" | "Coach Pro", string> = {
  Free: "coach-free",
  "Coach Pro": "coach-pro",
};

function findPlayerTierPlan(tier: PlanTier, plans: Plan[]): Plan | undefined {
  return plans.find((p) => p.slug === PLAYER_TIER_SLUGS[tier]);
}

function findCoachTierPlan(tier: "Free" | "Coach Pro", plans: Plan[]): Plan | undefined {
  return plans.find((p) => p.slug === COACH_TIER_SLUGS[tier]);
}

export function canGenerateAiReports(tier: PlanTier, plans: Plan[]): boolean {
  return findPlayerTierPlan(tier, plans)?.aiReportsEnabled ?? tier !== "Free";
}

export function canUseMarketplace(tier: PlanTier, plans: Plan[]): boolean {
  return findPlayerTierPlan(tier, plans)?.marketplaceEnabled ?? tier !== "Free";
}

/** Free tier's monthly session cap. Paid tiers are unlimited (null) by default. */
export function sessionsLimitForPlan(tier: PlanTier, plans: Plan[]): number | null {
  const plan = findPlayerTierPlan(tier, plans);
  return plan ? plan.sessionsPerMonthLimit : (tier === "Free" ? 4 : null);
}

/** Free tier's daily Coach AI chat message cap. Paid tiers are unlimited (null) by default. */
export function chatMessagesLimitForPlan(tier: PlanTier, plans: Plan[]): number | null {
  const plan = findPlayerTierPlan(tier, plans);
  return plan ? plan.chatMessagesPerDayLimit : (tier === "Free" ? 3 : null);
}

export function isUnlimited(sessionsLimit: number | null): boolean {
  return sessionsLimit === null;
}

/** Shared bullet-point summary of what a tier includes — used by the welcome email
 * (api/approve-user) and the player-facing plan comparison (SubscriptionPage). */
export function planFeatureLines(tier: PlanTier, plans: Plan[]): string[] {
  const sessionsLimit = sessionsLimitForPlan(tier, plans);
  const chatLimit = chatMessagesLimitForPlan(tier, plans);
  return [
    sessionsLimit === null ? "Unlimited sessions logged" : `${sessionsLimit} sessions logged per month`,
    canGenerateAiReports(tier, plans) ? "AI biomechanics reports" : "AI biomechanics reports — upgrade to unlock",
    canUseMarketplace(tier, plans) ? "Coach marketplace access" : "Coach marketplace — upgrade to unlock",
    chatLimit === null ? "Unlimited Coach AI chat" : `${chatLimit} Coach AI messages per day`,
  ];
}

/** A coach's own Free tier unlocks nothing extra by default — Coach Pro is required for all
 * three of these. Falls back sensibly if the coach-pro/coach-free rows are ever missing. */
export function canUseMarketplaceForCoach(tier: "Free" | "Coach Pro", plans: Plan[]): boolean {
  return findCoachTierPlan(tier, plans)?.marketplaceEnabled ?? tier !== "Free";
}

export function canGenerateAiReportsForCoach(tier: "Free" | "Coach Pro", plans: Plan[]): boolean {
  return findCoachTierPlan(tier, plans)?.aiReportsEnabled ?? tier !== "Free";
}

/** An independent coach's own roster cap — reuses the org-plan `seatCap` field (otherwise only
 * meaningful for an academy's headcount) since a coach's Free-tier roster is the exact same
 * "how many players am I allowed" shape. null means unlimited, same convention as every other
 * limit here — Coach Pro should always be left uncapped in the catalog. */
export function rosterCapForCoachPlan(tier: "Free" | "Coach Pro", plans: Plan[]): number | null {
  const plan = findCoachTierPlan(tier, plans);
  return plan ? plan.seatCap : (tier === "Free" ? 5 : null);
}

/** Whether AI biomechanics reports are included for this player right now — shared by
 * SessionsClient (deciding whether to show a paywall on the generate-report button) and
 * PortalClient (deciding whether to show the same paywall on the player/parent's own Reports
 * section, so the person who'd actually choose to upgrade sees the same prompt staff does).
 * Checked in order: the player's own plan; their academy's plan if it waives session fees (e.g. a
 * cricket board license) and, when that plan has a limited access window, only while that window
 * is still open (see academy.accessExpiresAt, set by the webhook on subscribe); an independent
 * coach's own Coach Pro plan, which covers every player on their roster the same way — the coach
 * is the one paying for the capability, not each individual player. An academy-employed coach's
 * own Pro status never extends to their players — only the academy's own plan can do that. */
export function aiReportsIncludedForPlayer(
  player: Player,
  plans: Plan[],
  academies: Academy[],
  coaches: Coach[],
): boolean {
  if (canGenerateAiReports(player.subscription.plan, plans)) return true;
  const academy = academies.find((a) => a.playerIds.includes(player.id));
  if (academy?.planId) {
    const plan = plans.find((p) => p.id === academy.planId);
    if (plan?.waivesSessionFees) {
      const withinMonitoringWindow =
        plan.accessDurationMonths == null ||
        (!!academy.accessExpiresAt && new Date(academy.accessExpiresAt) > new Date());
      if (withinMonitoringWindow) return true;
    }
  }
  if (player.coachId) {
    const coach = coaches.find((c) => c.id === player.coachId);
    if (coach && !coach.academyId && canGenerateAiReportsForCoach(coach.subPlan as "Free" | "Coach Pro", plans)) return true;
  }
  return false;
}

/** Coach-facing equivalent of planFeatureLines — same three admin-editable Plan Catalog toggles
 * (marketplaceEnabled/seatCap/aiReportsEnabled) as the player side, just read from the coach's own
 * `coach-free`/`coach-pro` rows instead, and described for what a coach cares about instead of
 * what a player does. Used by CoachSubscriptionPage. */
export function coachPlanFeatureLines(tier: "Free" | "Coach Pro", plans: Plan[]): string[] {
  const rosterCap = rosterCapForCoachPlan(tier, plans);
  return [
    canUseMarketplaceForCoach(tier, plans) ? "Marketplace visibility — get found & booked by players" : "Marketplace visibility — upgrade to unlock",
    rosterCap === null ? "Unlimited players on your roster" : `Up to ${rosterCap} players on your roster`,
    canGenerateAiReportsForCoach(tier, plans) ? "AI biomechanics reports for your players" : "AI biomechanics reports — upgrade to unlock",
  ];
}
