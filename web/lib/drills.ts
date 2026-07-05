// Coaching drills mapped to the same metric IDs that trigger a guideline flag
// in lib/biomechanics.ts. Kept as data (not baked into the flag text) so the
// same drill list can be reused across the report UI and the PDF.

export interface Drill {
  id: string;
  name: string;
  focus: string;
  description: string;
}

export const DRILLS_BY_METRIC: Record<string, Drill> = {
  frontKneeFFC: {
    id: "front-knee-brace",
    name: "Wall Knee-Brace Drill",
    focus: "Front knee extension at landing",
    description: "Bowl into a wall or net from 3-4 approach steps, focusing on landing with a firm, near-straight front leg and holding the brace through release. Repeat in slow motion before adding pace back in.",
  },
  trunkLateralRelease: {
    id: "tall-release-drill",
    name: "Tall Release Drill",
    focus: "Trunk lateral flexion at release",
    description: "Bowl side-on to a wall with a vertical line marked on it; aim to keep the head and spine stacked over the front hip through release rather than collapsing sideways. Shadow-bowl in front of a mirror to reinforce the upright release position.",
  },
  shoulderHipSep: {
    id: "hip-shoulder-separation-drill",
    name: "Hip-Shoulder Separation Drill",
    focus: "Counter-rotation (\"mixed action\") at front-foot contact",
    description: "Walk-through deliveries focusing on getting the hips to face the target early while the shoulders stay closed a fraction longer, then rotate through — exaggerate the sequencing slowly before returning to full-pace bowling.",
  },
  elbowExtension: {
    id: "straight-arm-drill",
    name: "Straight-Arm Release Drill",
    focus: "Elbow extension at release",
    description: "One-arm throwing drills with a tennis ball, focusing on a fully extended elbow at the point of release. Progress back into the full bowling action once the straight-arm pattern feels automatic.",
  },
};

export function drillsForMetricIds(metricIds: string[]): Drill[] {
  const seen = new Set<string>();
  const drills: Drill[] = [];
  for (const id of metricIds) {
    const drill = DRILLS_BY_METRIC[id];
    if (drill && !seen.has(drill.id)) {
      seen.add(drill.id);
      drills.push(drill);
    }
  }
  return drills;
}
