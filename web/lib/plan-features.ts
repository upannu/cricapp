// Freemium feature-gating — single source of truth for what each plan
// tier unlocks, so the gates are consistent everywhere they're checked
// (and trivial to change if the actual pricing/feature split differs from
// this default: it's just this one file).
//
// Chosen split: Free covers basic session logging up to a monthly cap; the
// product's actual value-add (AI biomechanics analysis, ball tracking, and
// self-service coach discovery) sits behind Player Pro / Coach Pro. Coach
// workflow tools (video markup, voice notes, assessments) are left ungated
// for now — they're coach-initiated, not tied to the player's own plan, and
// gating them would need a separate coach-side plan concept that doesn't exist.

import type { PlanTier } from "./types";

const PLAN_RANK: Record<PlanTier, number> = { Free: 0, "Player Pro": 1, "Coach Pro": 2 };

function atLeast(plan: PlanTier, required: PlanTier): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[required];
}

export function canGenerateAiReports(plan: PlanTier): boolean {
  return atLeast(plan, "Player Pro");
}

export function canUseMarketplace(plan: PlanTier): boolean {
  return atLeast(plan, "Player Pro");
}

/** Free tier's monthly session cap. Paid tiers are unlimited (null). */
export function sessionsLimitForPlan(plan: PlanTier): number | null {
  return plan === "Free" ? 4 : null;
}

/** Free tier's daily Coach AI chat message cap. Paid tiers are unlimited (null). */
export function chatMessagesLimitForPlan(plan: PlanTier): number | null {
  return plan === "Free" ? 3 : null;
}

export function isUnlimited(sessionsLimit: number | null): boolean {
  return sessionsLimit === null;
}
