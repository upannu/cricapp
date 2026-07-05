// Renders a schematic pitch-length/line diagram highlighting the classified
// bounce zone. Deliberately a zone grid rather than a pixel-precise dot on a
// photo: the length axis is genuinely calibrated (real distance via the
// camera calibration), but the line (off/leg) axis is only a coarse 3-way
// classification, not a calibrated measurement — a schematic honestly
// represents that resolution instead of implying false precision.

import type { PitchLengthZone, PitchLine } from "./types";

const LENGTH_ZONES: PitchLengthZone[] = ["Bouncer", "Short", "Good Length", "Full", "Yorker", "Full Toss"];
const LINES: PitchLine[] = ["Off side", "Middle", "Leg side"];

const WIDTH = 360;
const HEIGHT = 480;
const MARGIN = 30;

export async function renderPitchMap(
  lengthZone: PitchLengthZone | null,
  line: PitchLine | null,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  // Background
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const pitchW = WIDTH - MARGIN * 2;
  const pitchH = HEIGHT - MARGIN * 2;
  const rowH = pitchH / LENGTH_ZONES.length;
  const colW = pitchW / LINES.length;

  // Pitch surface
  ctx.fillStyle = "#c9a876";
  ctx.fillRect(MARGIN, MARGIN, pitchW, pitchH);

  // Zone grid + labels
  ctx.font = "11px sans-serif";
  ctx.textBaseline = "middle";
  for (let r = 0; r < LENGTH_ZONES.length; r++) {
    for (let c = 0; c < LINES.length; c++) {
      const x = MARGIN + c * colW;
      const y = MARGIN + r * rowH;
      const isTarget = LENGTH_ZONES[r] === lengthZone && LINES[c] === line;
      ctx.fillStyle = isTarget ? "rgba(0, 212, 170, 0.55)" : "rgba(255,255,255,0.03)";
      ctx.fillRect(x, y, colW, rowH);
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.strokeRect(x, y, colW, rowH);
    }
  }

  // Bounce marker
  if (lengthZone && line) {
    const r = LENGTH_ZONES.indexOf(lengthZone);
    const c = LINES.indexOf(line);
    if (r >= 0 && c >= 0) {
      const cx = MARGIN + c * colW + colW / 2;
      const cy = MARGIN + r * rowH + rowH / 2;
      ctx.fillStyle = "#FF6B2B";
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Stump markers at each end
  ctx.fillStyle = "#3a2a1a";
  ctx.fillRect(MARGIN + pitchW / 2 - 12, MARGIN - 6, 24, 6);
  ctx.fillRect(MARGIN + pitchW / 2 - 12, MARGIN + pitchH, 24, 6);

  // Row labels
  ctx.fillStyle = "#e6edf3";
  ctx.font = "11px sans-serif";
  for (let r = 0; r < LENGTH_ZONES.length; r++) {
    const y = MARGIN + r * rowH + rowH / 2;
    ctx.textAlign = "right";
    ctx.fillText(LENGTH_ZONES[r], MARGIN - 6, y);
  }
  // Column labels
  ctx.textAlign = "center";
  for (let c = 0; c < LINES.length; c++) {
    const x = MARGIN + c * colW + colW / 2;
    ctx.fillText(LINES[c], x, MARGIN + pitchH + 22);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode pitch map image."))), "image/png");
  });
}

const LENGTH_ZONE_RANGES_M: [number, number, PitchLengthZone][] = [
  [0, 1, "Yorker"],
  [1, 3, "Full"],
  [3, 6, "Good Length"],
  [6, 8, "Short"],
  [8, 100, "Bouncer"],
];

/** Distance is measured from the batsman's stumps (the calibration's point2), in meters. */
export function classifyLengthZone(distanceFromBatsmanStumpsM: number): PitchLengthZone {
  for (const [lo, hi, zone] of LENGTH_ZONE_RANGES_M) {
    if (distanceFromBatsmanStumpsM >= lo && distanceFromBatsmanStumpsM < hi) return zone;
  }
  return "Bouncer";
}
