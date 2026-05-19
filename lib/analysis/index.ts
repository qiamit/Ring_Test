/**
 * Ring test analysis — TypeScript port of the IS 1786 logic from the desktop
 * app. The web version expects the user to interactively place the inner /
 * outer ring (as circles) and the diameter rectangle, then derives the eight
 * thickness segments, mm conversions, area shares, and pass/fail verdicts.
 */

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

export interface DiameterBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ThicknessPair {
  label: string;
  angle_deg: number;
  inner_xy: [number, number];
  outer_xy: [number, number];
  thickness_mm: number | null;
}

export const T_LABELS: Array<{ angle: number; label: string }> = [
  { angle: 270, label: "t1" },
  { angle: 315, label: "t2" },
  { angle: 0, label: "t3" },
  { angle: 45, label: "t4" },
  { angle: 90, label: "t5" },
  { angle: 135, label: "t6" },
  { angle: 180, label: "t7" },
  { angle: 225, label: "t8" },
];

export interface RingResult {
  thicknessPairs: ThicknessPair[];
  thicknessMin: number | null;
  thicknessMax: number | null;
  thicknessMean: number | null;
  thicknessLow: number;
  thicknessHigh: number;
  thicknessInRange: boolean;
  areaTM: number;
  areaFP: number;
  tmShare: number;
  tmShareInRange: boolean;
  overallPass: boolean;
}

/**
 * Compute eight thickness segments given concentric inner and outer circles.
 * Markers are placed at IS 1786 reference angles (45° steps starting at 12 o'clock).
 *
 * `angularOffsetDeg` rotates all eight markers together (camera tilt correction).
 */
export function computeThicknessPairs(
  inner: Circle,
  outer: Circle,
  mmPerPx: number,
  angularOffsetDeg = 0,
): ThicknessPair[] {
  // Use the OUTER circle centre as the ray origin (it's the geometric centre of
  // the specimen). The inner circle may be slightly off-centre.
  const cx = outer.cx;
  const cy = outer.cy;

  return T_LABELS.map(({ angle, label }) => {
    const a = (angle + angularOffsetDeg) * (Math.PI / 180);
    const cos = Math.cos(a);
    const sin = Math.sin(a);

    // Inner intersection — distance from outer-centre to inner-circle along ray a
    const innerR = solveRayCircle(cx, cy, cos, sin, inner);
    const outerR = solveRayCircle(cx, cy, cos, sin, outer);

    if (innerR === null || outerR === null || outerR <= innerR + 1) {
      return {
        label,
        angle_deg: angle,
        inner_xy: [cx, cy],
        outer_xy: [cx, cy],
        thickness_mm: null,
      };
    }

    const ix = cx + cos * innerR;
    const iy = cy + sin * innerR;
    const ox = cx + cos * outerR;
    const oy = cy + sin * outerR;
    const thickPx = outerR - innerR;
    return {
      label,
      angle_deg: angle,
      inner_xy: [ix, iy],
      outer_xy: [ox, oy],
      thickness_mm: thickPx * mmPerPx,
    };
  });
}

/** Smallest positive distance from (px, py) along (cos, sin) to circle. */
function solveRayCircle(
  px: number,
  py: number,
  cos: number,
  sin: number,
  c: Circle,
): number | null {
  // |p + t*d - C|^2 = r^2
  const dx = px - c.cx;
  const dy = py - c.cy;
  const A = 1; // direction is unit vector
  const B = 2 * (dx * cos + dy * sin);
  const C = dx * dx + dy * dy - c.r * c.r;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-B - sq) / 2;
  const t2 = (-B + sq) / 2;
  // Pick smallest positive
  if (t1 > 1e-3) return t1;
  if (t2 > 1e-3) return t2;
  return null;
}

/**
 * Run the full IS 1786 analysis given two circles and calibration.
 * Returns thicknesses, areas, ratios and pass/fail verdicts.
 */
export function analyseRing(args: {
  inner: Circle;
  outer: Circle;
  sampleDiameterMm: number;
  mmPerPx: number;
  angularOffsetDeg?: number;
}): RingResult {
  const { inner, outer, sampleDiameterMm, mmPerPx, angularOffsetDeg = 0 } = args;

  const thicknessPairs = computeThicknessPairs(inner, outer, mmPerPx, angularOffsetDeg);
  const valid = thicknessPairs
    .map((p) => p.thickness_mm)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  const thicknessMin = valid.length ? Math.min(...valid) : null;
  const thicknessMax = valid.length ? Math.max(...valid) : null;
  const thicknessMean = valid.length
    ? valid.reduce((s, v) => s + v, 0) / valid.length
    : null;

  const lowLimit = sampleDiameterMm * 0.07;
  const highLimit = sampleDiameterMm * 0.15;
  const thicknessInRange =
    valid.length === 8 && valid.every((v) => v >= lowLimit && v <= highLimit);

  // Areas (mm²) — TM is the annulus between inner and outer; F&P is the inner disk.
  const areaTM = Math.PI * (outer.r * outer.r - inner.r * inner.r) * mmPerPx * mmPerPx;
  const areaFP = Math.PI * inner.r * inner.r * mmPerPx * mmPerPx;
  const total = areaTM + areaFP;
  const tmShare = total > 0 ? (areaTM / total) * 100 : 0;
  const tmShareInRange = tmShare >= 30 && tmShare <= 50;
  const overallPass = thicknessInRange && tmShareInRange;

  return {
    thicknessPairs,
    thicknessMin,
    thicknessMax,
    thicknessMean,
    thicknessLow: lowLimit,
    thicknessHigh: highLimit,
    thicknessInRange,
    areaTM,
    areaFP,
    tmShare,
    tmShareInRange,
    overallPass,
  };
}

/**
 * Lightweight automatic circle initialiser used by the canvas editor.
 * Heuristic: place outer at 45% of the smaller image dimension, inner at 22%.
 */
export function suggestInitialCircles(
  imageWidth: number,
  imageHeight: number,
): { inner: Circle; outer: Circle; diam: DiameterBox } {
  const cx = imageWidth / 2;
  const cy = imageHeight / 2;
  const r = Math.min(imageWidth, imageHeight) * 0.45;
  const outer = { cx, cy, r };
  const inner = { cx, cy, r: r * 0.5 };
  const diam = {
    x: cx - r,
    y: cy - r,
    w: r * 2,
    h: r * 2,
  };
  return { inner, outer, diam };
}
