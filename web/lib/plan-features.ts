// Freemium feature-gating — single source of truth for what each individual tier (Free / Player
// Pro / Coach Pro) unlocks. The tiers themselves are fixed (see `PlanTier`), but their limits and
// feature toggles are admin-editable Plan Catalog rows (slug `free`/`player-pro`/`coach-pro`,
// `plan.locked === true`) — see /admin/plans. Every function here takes the caller's already-
// fetched `plans` list rather than querying itself, matching `getSessionFee`/`getPlatformFeePercent`
// in lib/utils.ts.

import type { Plan, PlanTier } from "./types";

const TIER_SLUGS: Record<PlanTier, string> = {
  Free: "free",
  "Player Pro": "player-pro",
  "Coach Pro": "coach-pro",
};

function findTierPlan(tier: PlanTier, plans: Plan[]): Plan | undefined {
  return plans.find((p) => p.slug === TIER_SLUGS[tier]);
}

export function canGenerateAiReports(tier: PlanTier, plans: Plan[]): boolean {
  return findTierPlan(tier, plans)?.aiReportsEnabled ?? tier !== "Free";
}

export function canUseMarketplace(tier: PlanTier, plans: Plan[]): boolean {
  return findTierPlan(tier, plans)?.marketplaceEnabled ?? tier !== "Free";
}

/** Free tier's monthly session cap. Paid tiers are unlimited (null) by default. */
export function sessionsLimitForPlan(tier: PlanTier, plans: Plan[]): number | null {
  const plan = findTierPlan(tier, plans);
  return plan ? plan.sessionsPerMonthLimit : (tier === "Free" ? 4 : null);
}

/** Free tier's daily Coach AI chat message cap. Paid tiers are unlimited (null) by default. */
export function chatMessagesLimitForPlan(tier: PlanTier, plans: Plan[]): number | null {
  const plan = findTierPlan(tier, plans);
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
