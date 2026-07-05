// Gamification milestones — derived entirely from data that already exists
// (session count, XP total, report count), not a separate awarded-events
// table. That means a badge's earned state is always correct and recomputed
// fresh from the current totals — nothing to "miss" awarding on a skipped
// trigger, and nothing to migrate if the milestone list changes later.

import type { Player } from "./types";
import { ACADEMY_TOTAL_ARTICLES, TIP_STREAK_TARGET_DAYS } from "./academy-content";

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  progress?: { current: number; target: number };
}

const SESSION_MILESTONES = [1, 5, 10, 25, 50, 100];
const XP_MILESTONES = [100, 500, 1000, 2500, 5000];

export function computeBadges(player: Player, reportCount: number): Badge[] {
  const badges: Badge[] = [];

  for (const m of SESSION_MILESTONES) {
    badges.push({
      id: `sessions-${m}`,
      name: `${m} Session${m > 1 ? "s" : ""}`,
      description: `Log ${m} training session${m > 1 ? "s" : ""}`,
      icon: "🏏",
      earned: player.sessionsCount >= m,
      progress: player.sessionsCount < m ? { current: player.sessionsCount, target: m } : undefined,
    });
  }

  for (const m of XP_MILESTONES) {
    badges.push({
      id: `xp-${m}`,
      name: `${m.toLocaleString()} XP`,
      description: `Earn ${m.toLocaleString()} experience points`,
      icon: "⚡",
      earned: player.xp >= m,
      progress: player.xp < m ? { current: player.xp, target: m } : undefined,
    });
  }

  badges.push({
    id: "first-report",
    name: "First Analysis",
    description: "Generate your first AI biomechanics report",
    icon: "📊",
    earned: reportCount >= 1,
    progress: reportCount < 1 ? { current: reportCount, target: 1 } : undefined,
  });

  badges.push({
    id: "five-reports",
    name: "Data Driven",
    description: "Generate 5 AI biomechanics reports",
    icon: "📈",
    earned: reportCount >= 5,
    progress: reportCount < 5 ? { current: reportCount, target: 5 } : undefined,
  });

  badges.push({
    id: "tip-streak",
    name: "Consistent",
    description: `Read ${TIP_STREAK_TARGET_DAYS} consecutive daily tips`,
    icon: "🔥",
    earned: player.tipBestStreak >= TIP_STREAK_TARGET_DAYS,
    progress: player.tipBestStreak < TIP_STREAK_TARGET_DAYS
      ? { current: player.tipBestStreak, target: TIP_STREAK_TARGET_DAYS }
      : undefined,
  });

  badges.push({
    id: "academy-master",
    name: "Master",
    description: `Complete all ${ACADEMY_TOTAL_ARTICLES} Academy articles`,
    icon: "🎓",
    earned: player.academy.articlesRead >= ACADEMY_TOTAL_ARTICLES,
    progress: player.academy.articlesRead < ACADEMY_TOTAL_ARTICLES
      ? { current: player.academy.articlesRead, target: ACADEMY_TOTAL_ARTICLES }
      : undefined,
  });

  return badges;
}
