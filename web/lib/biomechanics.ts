// The actual measurement engine: takes pose-landmark trajectories (from
// lib/pose.ts) and computes real geometric metrics — joint angles, phase
// timing, zone scores, guideline-based flags. Replaces "Claude looks at 2
// still frames and guesses a number" with genuine 3D-landmark geometry.
//
// IMPORTANT — read before changing thresholds or trusting these numbers:
// - Metrics are computed from MONOCULAR pose estimation (a single camera, no
//   depth sensor, no calibration). MediaPipe's "world landmarks" give a
//   metric-scale 3D estimate, which is good enough for joint ANGLES (angles
//   are invariant to the overall scale/distance ambiguity that monocular
//   depth suffers from) but not for absolute distances/speeds in real-world
//   units — so this file reports angles and normalized ratios, never
//   fabricated km/h or meters.
// - GUIDELINE_RANGES below are heuristic reference ranges inspired by
//   commonly-discussed fast-bowling coaching literature (e.g. knee brace at
//   front-foot contact, trunk lateral flexion, shoulder-hip counter-rotation
//   as discussed in ECB/Cricket Australia-style coaching education). They are
//   NOT clinically validated against motion-capture or injury-outcome data
//   for this app, and should be surfaced to users as guidelines to discuss
//   with a coach — never as a medical/diagnostic claim.

import type { PoseFrame, Landmark } from "./pose";
import type { ActionType, InjuryRisk } from "./types";

export const DISCLAIMER =
  "Computed from single-camera pose estimation, not motion-capture. Angle/phase math is real geometry; the reference ranges are general fast-bowling coaching guidelines, not a clinical or medically validated assessment for any individual athlete.";

// ─── Landmark indices (standard 33-point MediaPipe Pose topology) ──────────

const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32,
} as const;

export type Side = "left" | "right";

/** Bowling arm and front (leading) leg are anatomically opposite sides in the vast majority of actions. */
export function bowlingArmSide(bowlingStyle: string): Side {
  return /left/i.test(bowlingStyle) ? "left" : "right";
}
function otherSide(side: Side): Side { return side === "left" ? "right" : "left"; }

function sideIdx(side: Side) {
  return side === "left"
    ? { shoulder: LM.LEFT_SHOULDER, elbow: LM.LEFT_ELBOW, wrist: LM.LEFT_WRIST, hip: LM.LEFT_HIP, knee: LM.LEFT_KNEE, ankle: LM.LEFT_ANKLE, heel: LM.LEFT_HEEL, footIndex: LM.LEFT_FOOT_INDEX }
    : { shoulder: LM.RIGHT_SHOULDER, elbow: LM.RIGHT_ELBOW, wrist: LM.RIGHT_WRIST, hip: LM.RIGHT_HIP, knee: LM.RIGHT_KNEE, ankle: LM.RIGHT_ANKLE, heel: LM.RIGHT_HEEL, footIndex: LM.RIGHT_FOOT_INDEX };
}

// ─── Vector / angle geometry (3D, on world landmarks) ──────────────────────

type Vec3 = [number, number, number];
const v = (p: Landmark): Vec3 => [p.x, p.y, p.z];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mag = (a: Vec3) => Math.sqrt(dot(a, a));
const dist = (a: Vec3, b: Vec3) => mag(sub(a, b));
const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/** Angle at point B formed by A-B-C, in degrees. */
function angleAt(a: Landmark, b: Landmark, c: Landmark): number {
  const ba = sub(v(a), v(b));
  const bc = sub(v(c), v(b));
  const cos = dot(ba, bc) / (mag(ba) * mag(bc) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** Angle of a Vec3 direction from the horizontal plane, in degrees (0 = horizontal, 90 = straight up/down). */
function angleFromHorizontalV(d: Vec3): number {
  const horizontalMag = Math.sqrt(d[0] * d[0] + d[2] * d[2]);
  return (Math.atan2(Math.abs(d[1]), horizontalMag) * 180) / Math.PI;
}

/** Angle of a Vec3 direction from vertical (up), in degrees — used for lean/flexion. */
function angleFromVerticalV(d: Vec3): number {
  return 90 - angleFromHorizontalV(d);
}

/** Angle of the from->to vector from the horizontal plane, in degrees. */
function angleFromHorizontal(from: Landmark, to: Landmark): number {
  return angleFromHorizontalV(sub(v(to), v(from)));
}

/** Trunk lean (hip-midpoint to shoulder-midpoint) from vertical, in degrees. */
function trunkLeanDeg(f: PoseFrame): number {
  const hipMid = mid(v(f.worldLandmarks[LM.LEFT_HIP]), v(f.worldLandmarks[LM.RIGHT_HIP]));
  const shoulderMid = mid(v(f.worldLandmarks[LM.LEFT_SHOULDER]), v(f.worldLandmarks[LM.RIGHT_SHOULDER]));
  return angleFromVerticalV(sub(shoulderMid, hipMid));
}

// ─── Phase detection ────────────────────────────────────────────────────────

export interface DeliveryPhases {
  backFootContactSec: number | null;
  frontFootContactSec: number | null;
  releaseSec: number | null;
  followThroughSec: number | null;
}

function speedSeries(frames: PoseFrame[], idx: number): number[] {
  const speeds: number[] = new Array(frames.length).fill(0);
  for (let i = 1; i < frames.length - 1; i++) {
    const dt = frames[i + 1].tSec - frames[i - 1].tSec || 1 / 30;
    speeds[i] = dist(v(frames[i + 1].worldLandmarks[idx]), v(frames[i - 1].worldLandmarks[idx])) / dt;
  }
  return speeds;
}

/** First index, after some real motion has occurred, where the joint stays near-stationary for >= minMs. */
function findPlantIndex(frames: PoseFrame[], idx: number, searchFrom: number, searchTo: number, minMs = 120): number | null {
  const speeds = speedSeries(frames, idx);
  const maxSpeed = Math.max(...speeds.slice(searchFrom, searchTo + 1), 1e-6);
  const threshold = maxSpeed * 0.18;
  let sawMotion = false;
  for (let i = searchFrom; i <= searchTo; i++) {
    if (speeds[i] > threshold) { sawMotion = true; continue; }
    if (!sawMotion) continue; // require the joint to have actually been moving first
    // check the stationary window holds for minMs
    let j = i;
    while (j <= searchTo && speeds[j] <= threshold && (frames[j].tSec - frames[i].tSec) * 1000 < minMs) j++;
    if ((frames[Math.min(j, searchTo)].tSec - frames[i].tSec) * 1000 >= minMs || j > searchTo) {
      return i;
    }
  }
  return null;
}

function findPeakSpeedIndex(frames: PoseFrame[], idx: number, searchFrom: number, searchTo: number): number | null {
  const speeds = speedSeries(frames, idx);
  let best = -1, bestSpeed = -1;
  for (let i = searchFrom; i <= searchTo; i++) {
    if (speeds[i] > bestSpeed) { bestSpeed = speeds[i]; best = i; }
  }
  return best >= 0 ? best : null;
}

/**
 * Detects back-foot contact, front-foot contact, release, and follow-through
 * from a side-angle pose sequence. Any phase that can't be confidently
 * detected is left null rather than guessed — downstream metrics that need
 * it are simply omitted instead of fabricated.
 */
export function detectDeliveryPhases(frames: PoseFrame[], bowlingSide: Side): DeliveryPhases {
  if (frames.length < 6) return { backFootContactSec: null, frontFootContactSec: null, releaseSec: null, followThroughSec: null };

  const frontSide = otherSide(bowlingSide);
  const frontAnkle = sideIdx(frontSide).ankle;
  const backAnkle = sideIdx(bowlingSide).ankle;
  const bowlingWrist = sideIdx(bowlingSide).wrist;

  const n = frames.length;
  // Front-foot contact: search the back 70% of the clip (run-up/gather happens first).
  const ffcIdx = findPlantIndex(frames, frontAnkle, Math.floor(n * 0.3), n - 2);
  // Back-foot contact: last plant of the back ankle before FFC.
  const bfcSearchEnd = ffcIdx ?? Math.floor(n * 0.6);
  const bfcIdx = findPlantIndex(frames, backAnkle, 0, Math.max(1, bfcSearchEnd - 1));
  // Release: peak bowling-wrist speed shortly after FFC.
  const releaseSearchStart = ffcIdx ?? Math.floor(n * 0.5);
  const releaseIdx = findPeakSpeedIndex(frames, bowlingWrist, releaseSearchStart, n - 1);
  // Follow-through: ~0.35s after release, clamped to the available sequence.
  let followIdx: number | null = null;
  if (releaseIdx !== null) {
    const targetT = frames[releaseIdx].tSec + 0.35;
    followIdx = frames.reduce((best, f, i) => (Math.abs(f.tSec - targetT) < Math.abs(frames[best].tSec - targetT) ? i : best), releaseIdx);
  }

  return {
    backFootContactSec: bfcIdx !== null ? frames[bfcIdx].tSec : null,
    frontFootContactSec: ffcIdx !== null ? frames[ffcIdx].tSec : null,
    releaseSec: releaseIdx !== null ? frames[releaseIdx].tSec : null,
    followThroughSec: followIdx !== null ? frames[followIdx].tSec : null,
  };
}

function nearestFrame(frames: PoseFrame[], tSec: number | null): PoseFrame | null {
  if (tSec === null || frames.length === 0) return null;
  return frames.reduce((best, f) => (Math.abs(f.tSec - tSec) < Math.abs(best.tSec - tSec) ? f : best));
}

// ─── Metrics ────────────────────────────────────────────────────────────────

export type ZoneId = "approach" | "deliveryStride" | "release" | "followThrough";

export interface Metric {
  id: string;
  label: string;
  zone: ZoneId;
  value: number | null;
  unit: string;
  idealRange?: [number, number];
  score: number | null; // 0-100, null if value unavailable
}

export interface BiomechanicsResult {
  phases: DeliveryPhases;
  metrics: Metric[];
  zoneScores: Record<ZoneId, number | null>;
  flags: string[];
  flaggedMetricIds: string[];
  overallScore: number | null;
  actionType: ActionType;
  injuryRisk: InjuryRisk;
  disclaimer: string;
}

/** Guideline reference ranges — see file header disclaimer. Tolerance controls how fast the score decays outside the range. */
const GUIDELINE_RANGES: Record<string, { range: [number, number]; tolerance: number }> = {
  frontKneeFFC:        { range: [155, 180], tolerance: 40 },
  frontKneeRelease:    { range: [150, 180], tolerance: 40 },
  frontKneeFlexRange:  { range: [0, 20], tolerance: 25 },
  strideLength:        { range: [0.8, 1.3], tolerance: 0.5 },
  footLandingAlign:    { range: [0, 15], tolerance: 20 },
  trunkLateralFFC:     { range: [0, 20], tolerance: 20 },
  shoulderHipSep:      { range: [10, 40], tolerance: 30 },
  bowlingArmElevation: { range: [80, 100], tolerance: 35 },
  elbowExtension:      { range: [155, 180], tolerance: 35 },
  releaseHeight:       { range: [0.9, 1.15], tolerance: 0.3 },
  trunkLateralRelease: { range: [0, 25], tolerance: 25 },
  nonBowlingArmElev:   { range: [60, 100], tolerance: 40 },
  headDrift:           { range: [0, 0.15], tolerance: 0.25 },
  trunkFlexFT:         { range: [20, 55], tolerance: 35 },
  trunkFlexChange:     { range: [10, 40], tolerance: 30 },
  landingBalance:      { range: [0, 0.2], tolerance: 0.3 },
  approachStraightness:{ range: [0, 15], tolerance: 25 },
  headStabilityApproach:{ range: [0, 0.12], tolerance: 0.2 },
  approachRhythm:      { range: [0, 0.08], tolerance: 0.15 },
};

function scoreAgainstRange(value: number, id: string): number {
  const guide = GUIDELINE_RANGES[id];
  if (!guide) return 100;
  const [lo, hi] = guide.range;
  const distanceOutside = value < lo ? lo - value : value > hi ? value - hi : 0;
  return Math.round(Math.max(0, 100 - (distanceOutside / guide.tolerance) * 100));
}

function metric(id: string, label: string, zone: ZoneId, value: number | null, unit: string): Metric {
  const guide = GUIDELINE_RANGES[id];
  return {
    id, label, zone, value: value === null ? null : Math.round(value * 100) / 100, unit,
    idealRange: guide?.range,
    score: value === null ? null : scoreAgainstRange(value, id),
  };
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, x) => s + (x - m) ** 2, 0) / values.length);
}

/**
 * A large shoulder-hip counter-rotation is the well-established "mixed
 * action" signal. Distinguishing pure side-on from pure front-on (both
 * legitimate techniques) from a single camera is inherently approximate — it
 * compares hip orientation at back-foot contact to the run-up direction.
 * When there isn't enough signal to tell confidently, this returns "Mixed"
 * rather than guessing, since that's the flag that matters for coaching.
 */
function classifyActionType(shoulderHipSepAtFFC: number | null, hipAngleFromApproachAtBFC: number | null): ActionType {
  if (shoulderHipSepAtFFC !== null && shoulderHipSepAtFFC > 35) return "Mixed";
  if (hipAngleFromApproachAtBFC === null) return "Mixed";
  return Math.abs(hipAngleFromApproachAtBFC - 90) < 35 ? "Side-on" : "Front-on";
}

/** Aggregates the same guideline-threshold breaches used for flags into a single risk band. */
function classifyInjuryRisk(metrics: Metric[]): InjuryRisk {
  const watched = ["frontKneeFFC", "trunkLateralRelease", "shoulderHipSep", "elbowExtension"];
  const breached = watched.filter((id) => {
    const m = metrics.find((mm) => mm.id === id);
    return m?.score !== null && m?.score !== undefined && m.score < 40;
  }).length;
  const borderline = watched.filter((id) => {
    const m = metrics.find((mm) => mm.id === id);
    return m?.score !== null && m?.score !== undefined && m.score < 60;
  }).length;
  if (breached >= 2) return "High";
  if (breached >= 1 || borderline >= 2) return "Moderate";
  return "Low";
}

/**
 * Computes the full metric set from a single (side-angle) pose sequence.
 * `bodyHeightRef` is the shoulder-to-ankle span at front-foot contact, used
 * to normalize distance-based metrics so they're comparable across bowlers
 * of different heights and camera distances.
 */
export function computeBiomechanics(frames: PoseFrame[], bowlingStyle: string): BiomechanicsResult {
  const side = bowlingArmSide(bowlingStyle);
  const front = otherSide(side);
  const bIdx = sideIdx(side);
  const fIdx = sideIdx(front);

  const phases = detectDeliveryPhases(frames, side);
  const bfcF = nearestFrame(frames, phases.backFootContactSec);
  const ffcF = nearestFrame(frames, phases.frontFootContactSec);
  const relF = nearestFrame(frames, phases.releaseSec);
  const ftF = nearestFrame(frames, phases.followThroughSec);

  const bodyHeightRef = ffcF
    ? dist(v(ffcF.worldLandmarks[bIdx.shoulder]), v(ffcF.worldLandmarks[fIdx.ankle])) || 1
    : 1;
  const shoulderWidthRef = ffcF
    ? dist(v(ffcF.worldLandmarks[LM.LEFT_SHOULDER]), v(ffcF.worldLandmarks[LM.RIGHT_SHOULDER])) || 1
    : 1;

  const metrics: Metric[] = [];

  // ── Approach ──
  const preContactEnd = ffcF ?? bfcF;
  const approachFrames = preContactEnd ? frames.filter((f) => f.tSec <= preContactEnd.tSec) : [];
  if (approachFrames.length >= 4) {
    const hipMid = (f: PoseFrame) => mid(v(f.worldLandmarks[LM.LEFT_HIP]), v(f.worldLandmarks[LM.RIGHT_HIP]));
    const first = hipMid(approachFrames[0]);
    const midF = hipMid(approachFrames[Math.floor(approachFrames.length / 2)]);
    const last = hipMid(approachFrames[approachFrames.length - 1]);
    const v1 = sub(midF, first), v2 = sub(last, midF);
    const cos = dot(v1, v2) / (mag(v1) * mag(v2) || 1);
    const straightness = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    metrics.push(metric("approachStraightness", "Approach path straightness", "approach", straightness, "° deviation"));

    const headX = approachFrames.map((f) => f.worldLandmarks[LM.NOSE].x);
    metrics.push(metric("headStabilityApproach", "Head lateral stability (approach)", "approach", stddev(headX) / shoulderWidthRef, "× shoulder width"));

    const hipY = approachFrames.map((f) => f.worldLandmarks[LM.LEFT_HIP].y);
    metrics.push(metric("approachRhythm", "Approach rhythm (hip bounce)", "approach", stddev(hipY) / bodyHeightRef, "× body height"));
  } else {
    metrics.push(metric("approachStraightness", "Approach path straightness", "approach", null, "° deviation"));
    metrics.push(metric("headStabilityApproach", "Head lateral stability (approach)", "approach", null, "× shoulder width"));
    metrics.push(metric("approachRhythm", "Approach rhythm (hip bounce)", "approach", null, "× body height"));
  }

  // Approach direction vector — used both for the foot-landing-alignment metric
  // and (via hip orientation at BFC) to help classify side-on vs front-on below.
  const approachVec: Vec3 = approachFrames.length >= 2
    ? sub(mid(v(approachFrames[approachFrames.length - 1].worldLandmarks[LM.LEFT_HIP]), v(approachFrames[approachFrames.length - 1].worldLandmarks[LM.RIGHT_HIP])),
          mid(v(approachFrames[0].worldLandmarks[LM.LEFT_HIP]), v(approachFrames[0].worldLandmarks[LM.RIGHT_HIP])))
    : [1, 0, 0];

  let hipAngleFromApproachAtBFC: number | null = null;
  if (bfcF) {
    const hipVecAtBFC = sub(v(bfcF.worldLandmarks[LM.RIGHT_HIP]), v(bfcF.worldLandmarks[LM.LEFT_HIP]));
    const cos = dot([hipVecAtBFC[0], 0, hipVecAtBFC[2]], [approachVec[0], 0, approachVec[2]]) /
      ((Math.sqrt(hipVecAtBFC[0] ** 2 + hipVecAtBFC[2] ** 2) * Math.sqrt(approachVec[0] ** 2 + approachVec[2] ** 2)) || 1);
    hipAngleFromApproachAtBFC = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  }

  // ── Delivery stride (BFC -> FFC) ──
  const kneeAtBFC = bfcF ? angleAt(bfcF.worldLandmarks[fIdx.hip], bfcF.worldLandmarks[fIdx.knee], bfcF.worldLandmarks[fIdx.ankle]) : null;
  const kneeAtFFC = ffcF ? angleAt(ffcF.worldLandmarks[fIdx.hip], ffcF.worldLandmarks[fIdx.knee], ffcF.worldLandmarks[fIdx.ankle]) : null;
  metrics.push(metric("frontKneeBFC", "Front knee angle at back-foot contact", "deliveryStride", kneeAtBFC, "°"));
  metrics.push(metric("frontKneeFFC", "Front knee angle at front-foot contact", "deliveryStride", kneeAtFFC, "°"));
  metrics.push(metric("frontKneeFlexRange", "Front knee flexion through stride", "deliveryStride", kneeAtBFC !== null && kneeAtFFC !== null ? Math.abs(kneeAtBFC - kneeAtFFC) : null, "°"));

  if (ffcF) {
    const strideLen = dist(v(ffcF.worldLandmarks[bIdx.ankle]), v(ffcF.worldLandmarks[fIdx.ankle])) / bodyHeightRef;
    metrics.push(metric("strideLength", "Delivery stride length", "deliveryStride", strideLen, "× body height"));

    const footVec = sub(v(ffcF.worldLandmarks[fIdx.footIndex]), v(ffcF.worldLandmarks[fIdx.heel]));
    const cosAlign = dot([footVec[0], 0, footVec[2]], [approachVec[0], 0, approachVec[2]]) /
      ((Math.sqrt(footVec[0] ** 2 + footVec[2] ** 2) * Math.sqrt(approachVec[0] ** 2 + approachVec[2] ** 2)) || 1);
    const landingAngle = (Math.acos(Math.max(-1, Math.min(1, cosAlign))) * 180) / Math.PI;
    metrics.push(metric("footLandingAlign", "Front foot landing alignment", "deliveryStride", landingAngle, "° from approach line"));

    metrics.push(metric("trunkLateralFFC", "Trunk lateral flexion at front-foot contact", "deliveryStride", trunkLeanDeg(ffcF), "°"));

    const shoulderVec = sub(v(ffcF.worldLandmarks[LM.RIGHT_SHOULDER]), v(ffcF.worldLandmarks[LM.LEFT_SHOULDER]));
    const hipVec = sub(v(ffcF.worldLandmarks[LM.RIGHT_HIP]), v(ffcF.worldLandmarks[LM.LEFT_HIP]));
    const cosSep = dot([shoulderVec[0], 0, shoulderVec[2]], [hipVec[0], 0, hipVec[2]]) /
      ((Math.sqrt(shoulderVec[0] ** 2 + shoulderVec[2] ** 2) * Math.sqrt(hipVec[0] ** 2 + hipVec[2] ** 2)) || 1);
    const sep = (Math.acos(Math.max(-1, Math.min(1, cosSep))) * 180) / Math.PI;
    metrics.push(metric("shoulderHipSep", "Shoulder-hip separation (2D proxy)", "deliveryStride", sep, "°"));
  } else {
    metrics.push(metric("strideLength", "Delivery stride length", "deliveryStride", null, "× body height"));
    metrics.push(metric("footLandingAlign", "Front foot landing alignment", "deliveryStride", null, "° from approach line"));
    metrics.push(metric("trunkLateralFFC", "Trunk lateral flexion at front-foot contact", "deliveryStride", null, "°"));
    metrics.push(metric("shoulderHipSep", "Shoulder-hip separation (2D proxy)", "deliveryStride", null, "°"));
  }

  // ── Release ──
  const kneeAtRelease = relF ? angleAt(relF.worldLandmarks[fIdx.hip], relF.worldLandmarks[fIdx.knee], relF.worldLandmarks[fIdx.ankle]) : null;
  metrics.push(metric("frontKneeRelease", "Front knee angle at release", "release", kneeAtRelease, "°"));

  if (relF) {
    metrics.push(metric("bowlingArmElevation", "Bowling arm elevation at release", "release", angleFromHorizontal(relF.worldLandmarks[bIdx.shoulder], relF.worldLandmarks[bIdx.wrist]), "°"));
    metrics.push(metric("elbowExtension", "Bowling elbow extension at release", "release", angleAt(relF.worldLandmarks[bIdx.shoulder], relF.worldLandmarks[bIdx.elbow], relF.worldLandmarks[bIdx.wrist]), "°"));
    const releaseHeight = (relF.worldLandmarks[bIdx.wrist].y - relF.worldLandmarks[fIdx.ankle].y) / bodyHeightRef;
    metrics.push(metric("releaseHeight", "Release height", "release", Math.abs(releaseHeight), "× body height"));
    metrics.push(metric("trunkLateralRelease", "Trunk lateral flexion at release", "release", trunkLeanDeg(relF), "°"));
    metrics.push(metric("nonBowlingArmElev", "Non-bowling arm elevation at release", "release", angleFromHorizontal(relF.worldLandmarks[fIdx.shoulder], relF.worldLandmarks[fIdx.wrist]), "°"));

    if (ffcF) {
      const headOffsetAt = (f: PoseFrame) => {
        const hipCenter = mid(v(f.worldLandmarks[LM.LEFT_HIP]), v(f.worldLandmarks[LM.RIGHT_HIP]));
        return Math.abs(f.worldLandmarks[LM.NOSE].x - hipCenter[0]) / shoulderWidthRef;
      };
      metrics.push(metric("headDrift", "Head lateral drift (FFC to release)", "release", Math.abs(headOffsetAt(relF) - headOffsetAt(ffcF)), "× shoulder width"));
    } else {
      metrics.push(metric("headDrift", "Head lateral drift (FFC to release)", "release", null, "× shoulder width"));
    }
  } else {
    metrics.push(metric("bowlingArmElevation", "Bowling arm elevation at release", "release", null, "°"));
    metrics.push(metric("elbowExtension", "Bowling elbow extension at release", "release", null, "°"));
    metrics.push(metric("releaseHeight", "Release height", "release", null, "× body height"));
    metrics.push(metric("trunkLateralRelease", "Trunk lateral flexion at release", "release", null, "°"));
    metrics.push(metric("nonBowlingArmElev", "Non-bowling arm elevation at release", "release", null, "°"));
    metrics.push(metric("headDrift", "Head lateral drift (FFC to release)", "release", null, "× shoulder width"));
  }

  // ── Follow-through ──
  if (ftF) {
    const trunkFlexFT = trunkLeanDeg(ftF);
    metrics.push(metric("trunkFlexFT", "Trunk forward flexion at follow-through", "followThrough", trunkFlexFT, "°"));

    const trunkFlexRelease = relF ? trunkLeanDeg(relF) : null;
    metrics.push(metric("trunkFlexChange", "Follow-through trunk flexion change", "followThrough", trunkFlexRelease !== null ? Math.abs(trunkFlexFT - trunkFlexRelease) : null, "°"));

    if (relF) {
      const hipAt = (f: PoseFrame) => mid(v(f.worldLandmarks[LM.LEFT_HIP]), v(f.worldLandmarks[LM.RIGHT_HIP]));
      const sway = dist(hipAt(ftF), hipAt(relF)) / shoulderWidthRef;
      metrics.push(metric("landingBalance", "Landing balance (lateral sway)", "followThrough", sway, "× shoulder width"));
    } else {
      metrics.push(metric("landingBalance", "Landing balance (lateral sway)", "followThrough", null, "× shoulder width"));
    }
  } else {
    metrics.push(metric("trunkFlexFT", "Trunk forward flexion at follow-through", "followThrough", null, "°"));
    metrics.push(metric("trunkFlexChange", "Follow-through trunk flexion change", "followThrough", null, "°"));
    metrics.push(metric("landingBalance", "Landing balance (lateral sway)", "followThrough", null, "× shoulder width"));
  }

  // ── Zone scores ──
  const zoneScores = {} as Record<ZoneId, number | null>;
  for (const zone of ["approach", "deliveryStride", "release", "followThrough"] as ZoneId[]) {
    const zoneMetrics = metrics.filter((m) => m.zone === zone && m.score !== null);
    zoneScores[zone] = zoneMetrics.length ? Math.round(zoneMetrics.reduce((s, m) => s + (m.score ?? 0), 0) / zoneMetrics.length) : null;
  }
  const scored = metrics.filter((m) => m.score !== null);
  const overallScore = scored.length ? Math.round(scored.reduce((s, m) => s + (m.score ?? 0), 0) / scored.length) : null;

  // ── Guideline-based flags ──
  const flags: string[] = [];
  const flaggedMetricIds: string[] = [];
  const flagIfLow = (id: string, msg: string) => {
    const m = metrics.find((mm) => mm.id === id);
    if (m && m.score !== null && m.score < 60) { flags.push(msg); flaggedMetricIds.push(id); }
  };
  flagIfLow("frontKneeFFC", `⚠ Front knee angle at front-foot contact is ${kneeAtFFC?.toFixed(0)}° — well below the fully-braced range typically discussed in fast-bowling coaching guidance. Flexed front-leg landing patterns are commonly associated with "mixed action" technique and increased lower-back loading — worth a technical review, not a diagnosis.`);
  flagIfLow("trunkLateralRelease", `⚠ Trunk lateral flexion at release is elevated (${metrics.find((m) => m.id === "trunkLateralRelease")?.value}°) — large side-bend at release is a pattern coaching literature associates with increased lumbar spine loading.`);
  flagIfLow("shoulderHipSep", `⚠ Shoulder-hip separation at front-foot contact is outside the typical guideline range (${metrics.find((m) => m.id === "shoulderHipSep")?.value}°) — large counter-rotation is one of the classic "mixed action" indicators discussed in fast-bowling injury-risk literature.`);
  flagIfLow("elbowExtension", `⚠ Bowling elbow isn't close to fully extended at release (${metrics.find((m) => m.id === "elbowExtension")?.value}°) — worth checking against the legal-delivery elbow-extension guidance as well as technique.`);
  if (flags.length === 0 && overallScore !== null) {
    flags.push("✓ No guideline thresholds were breached in this delivery — all measured zones fall within the typical reference ranges.");
  }
  if (phases.frontFootContactSec === null || phases.releaseSec === null) {
    flags.push("ℹ Some phases (front-foot contact and/or release) couldn't be confidently detected from this clip — metrics depending on them are shown as unavailable rather than guessed. A clearer side-on view of the full delivery stride improves detection.");
  }

  const actionType = classifyActionType(
    metrics.find((m) => m.id === "shoulderHipSep")?.value ?? null,
    hipAngleFromApproachAtBFC,
  );
  const injuryRisk = classifyInjuryRisk(metrics);

  return { phases, metrics, zoneScores, flags, flaggedMetricIds, overallScore, actionType, injuryRisk, disclaimer: DISCLAIMER };
}
