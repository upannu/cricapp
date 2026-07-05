// Academy Content Library — the 4-stage article curriculum's unlock and XP rules.
// Single source of truth so the gate logic used by the reading UI and the one
// used to recompute a player's acad_stage after a read always agree.

import type { AcademyStage, Article, PlanTier } from "./types";
import { isPaidPlan } from "./stripe-client";

export const STAGE_ORDER: AcademyStage[] = ["Foundation", "Mechanics", "Velocity", "Elite"];

/** Total articles in the canonical 29-article curriculum — matches the doc spec, not `articles.length`, so completion % stays meaningful even if extra monthly articles are added later. */
export const ACADEMY_TOTAL_ARTICLES = 29;

export const XP_PER_ARTICLE: Record<AcademyStage, number> = {
  Foundation: 50,
  Mechanics: 100,
  Velocity: 150,
  Elite: 200,
};

export const STAGE_COMPLETE_BONUS_XP = 500;
export const ALL_ARTICLES_BONUS_XP = 1000;
export const TIP_STREAK_BONUS_XP = 200;
export const TIP_STREAK_TARGET_DAYS = 7;

/** How many articles of the previous stage must be read before a stage unlocks — from the doc's gate table. */
const UNLOCK_REQUIREMENT: Partial<Record<AcademyStage, { afterStage: AcademyStage; count: number }>> = {
  Mechanics: { afterStage: "Foundation", count: 5 },
  Velocity: { afterStage: "Mechanics", count: 6 },
  Elite: { afterStage: "Velocity", count: 6 },
};

/** Stage gates require Player Pro (or higher) once past the free Foundation stage. */
export function isStageUnlocked(
  stage: AcademyStage,
  plan: PlanTier,
  readCountByStage: Partial<Record<AcademyStage, number>>
): boolean {
  if (stage === "Foundation") return true;
  if (!isPaidPlan(plan)) return false;
  const req = UNLOCK_REQUIREMENT[stage];
  if (!req) return true;
  return (readCountByStage[req.afterStage] ?? 0) >= req.count;
}

export function isArticleUnlocked(
  article: Article,
  plan: PlanTier,
  readCountByStage: Partial<Record<AcademyStage, number>>
): boolean {
  return isStageUnlocked(article.stage, plan, readCountByStage);
}

/** The furthest stage a player has actually unlocked, for display as their current "Academy Progress" stage. */
export function currentUnlockedStage(
  plan: PlanTier,
  readCountByStage: Partial<Record<AcademyStage, number>>
): AcademyStage {
  let current: AcademyStage = "Foundation";
  for (const stage of STAGE_ORDER) {
    if (isStageUnlocked(stage, plan, readCountByStage)) current = stage;
  }
  return current;
}

export function stageLockReason(
  stage: AcademyStage,
  plan: PlanTier,
  readCountByStage: Partial<Record<AcademyStage, number>>
): string | null {
  if (isStageUnlocked(stage, plan, readCountByStage)) return null;
  const req = UNLOCK_REQUIREMENT[stage];
  if (!req) return null;
  const have = readCountByStage[req.afterStage] ?? 0;
  const parts: string[] = [];
  if (have < req.count) parts.push(`Read ${req.count - have} more ${req.afterStage} article${req.count - have === 1 ? "" : "s"}`);
  if (!isPaidPlan(plan)) parts.push("Upgrade to Player Pro");
  return parts.join(" and ") + " to unlock.";
}
