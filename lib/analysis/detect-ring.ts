import type { Circle } from "./index";

export type DetectRingOptions = {
  /** Constrain search inside this outer ring (for inner detect). */
  outer?: Circle | null;
  /** Constrain search outside this inner ring (for outer detect). */
  inner?: Circle | null;
  /** Seed centre in full-image coordinates. */
  seedCenter?: { cx: number; cy: number } | null;
  /** Optional expected radius in full-image pixels (AI/previous-fit seed). */
  expectedRadius?: number | null;
  /** Explicit source size (preferred — matches editor coords). */
  sourceWidth?: number;
  sourceHeight?: number;
  /** Working resolution for scanning. */
  maxWorkingSize?: number;
  /** Polygon vertex count when shape is irregular (default 36). */
  polygonSides?: number;
  /** Relative radius std below this → keep as circle (default 0.035 = 3.5%). */
  circleTolerance?: number;
};

export type DetectedRingShape = {
  circle: Circle;
  mode: "circle" | "polygon";
  sides: number;
  rotationDeg: number;
  pointOffsets: Array<{ dx: number; dy: number }>;
};

/** @deprecated Use DetectedRingShape */
export type DetectedInnerShape = DetectedRingShape;

export type DetectRingResult =
  | { ok: true; shape: DetectedRingShape }
  | { ok: false; reason: string };

type EdgeFinder = (
  gray: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  cos: number,
  sin: number,
  minR: number,
  maxR: number,
) => number | null;

/**
 * Detect the inner ring by scanning radial light→dark edges from the hole centre.
 */
export function detectInnerRingFromImage(
  source: CanvasImageSource,
  options: DetectRingOptions = {},
): DetectRingResult {
  return detectRingContour(source, options, "inner");
}
/**
 * Detect the outer ring by radial dark→light edge scanning.
 * Peak-preserving smooth keeps side/top lugs without fattening the whole contour.
 */
export function detectOuterRingFromImage(
  source: CanvasImageSource,
  options: DetectRingOptions = {},
): DetectRingResult {
  return detectOuterByPolarEdge(source, options);
}
/**
 * Outer boundary via polar dark→light edges (locked to inner centre).
 * Sub-ray max captures lug tips; peak-preserving smooth cleans noise without fattening.
 */
function detectOuterByPolarEdge(
  source: CanvasImageSource,
  options: DetectRingOptions,
): DetectRingResult {
  const size = resolveSize(source, options.sourceWidth, options.sourceHeight);
  if (!size) return { ok: false, reason: "Image size unavailable." };
  const { fullW, fullH } = size;

  const maxWorking = options.maxWorkingSize ?? 520;
  const scale = Math.min(1, maxWorking / Math.max(fullW, fullH));
  const w = Math.max(64, Math.round(fullW * scale));
  const h = Math.max(64, Math.round(fullH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { ok: false, reason: "Could not read image pixels." };

  try {
    ctx.drawImage(source, 0, 0, w, h);
  } catch {
    return { ok: false, reason: "Could not draw image for scanning." };
  }

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Security error reading pixels";
    return { ok: false, reason: `Pixel read blocked (${msg}).` };
  }

  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }
  const smooth = boxBlur(gray, w, h, 1);

  // Lock centre to inner — do not drift (keeps outer concentric and stable)
  let seedCx = (options.seedCenter?.cx ?? fullW / 2) * scale;
  let seedCy = (options.seedCenter?.cy ?? fullH / 2) * scale;
  if (options.inner && options.inner.r > 0) {
    seedCx = options.inner.cx * scale;
    seedCy = options.inner.cy * scale;
  }

  const halfMin = Math.min(w, h) / 2;
  let minR = Math.max(4, halfMin * 0.15);
  if (options.inner && options.inner.r > 0) {
    minR = Math.max(minR, options.inner.r * scale * 1.08);
  } else {
    const bootInner: number[] = [];
    for (let i = 0; i < 48; i++) {
      const ang = (i / 48) * Math.PI * 2;
      const hit = findInnerEdgeAlongRay(
        smooth,
        w,
        h,
        seedCx,
        seedCy,
        Math.cos(ang),
        Math.sin(ang),
        halfMin * 0.05,
        halfMin * 0.65,
      );
      if (hit !== null) bootInner.push(hit);
    }
    if (bootInner.length >= 12) {
      bootInner.sort((a, b) => a - b);
      minR = Math.max(minR, bootInner[Math.floor(bootInner.length / 2)]! * 1.08);
    }
  }
  const maxR = halfMin * 0.995;
  if (maxR - minR < 8) {
    return { ok: false, reason: "Search range too small — check ring sizes." };
  }

  const sides = Math.max(16, Math.min(72, Math.round(options.polygonSides ?? 48)));
  const contourR = new Array<number>(sides).fill(0);
  let hitCount = 0;

  for (let i = 0; i < sides; i++) {
    const ang = (i / sides) * Math.PI * 2;
    let best: number | null = null;
    // Sub-rays: take outermost valid edge in the sector (lug tips)
    for (let sub = -2; sub <= 2; sub++) {
      const a2 = ang + (sub * (Math.PI * 2)) / sides / 5;
      const hit = findOuterEdgeAlongRay(
        smooth,
        w,
        h,
        seedCx,
        seedCy,
        Math.cos(a2),
        Math.sin(a2),
        minR,
        maxR,
      );
      if (hit === null) continue;
      if (best === null || hit > best) best = hit;
    }
    if (best !== null) {
      contourR[i] = best;
      hitCount++;
    }
  }

  if (hitCount < Math.max(12, Math.floor(sides * 0.55))) {
    return { ok: false, reason: "Could not trace outer edge." };
  }

  // Fill gaps with linear interp (not max — avoids fake bulges)
  for (let i = 0; i < sides; i++) {
    if (contourR[i]! > 0) continue;
    let prev = -1;
    let next = -1;
    for (let d = 1; d < sides; d++) {
      if (prev < 0 && contourR[(i - d + sides) % sides]! > 0) prev = (i - d + sides) % sides;
      if (next < 0 && contourR[(i + d) % sides]! > 0) next = (i + d) % sides;
      if (prev >= 0 && next >= 0) break;
    }
    if (prev >= 0 && next >= 0) {
      const span = ((next - prev + sides) % sides) || 1;
      const t = ((i - prev + sides) % sides) / span;
      contourR[i] = contourR[prev]! * (1 - t) + contourR[next]! * t;
    } else if (prev >= 0) {
      contourR[i] = contourR[prev]!;
    } else if (next >= 0) {
      contourR[i] = contourR[next]!;
    }
  }

  // Reject extreme outliers (>18% above / below local median), then peak-preserving smooth
  let working = contourR.slice();
  {
    const cleaned = working.slice();
    for (let i = 0; i < sides; i++) {
      const neigh = [
        working[(i - 2 + sides) % sides]!,
        working[(i - 1 + sides) % sides]!,
        working[(i + 1) % sides]!,
        working[(i + 2) % sides]!,
      ].sort((a, b) => a - b);
      const localMed = (neigh[1]! + neigh[2]!) / 2;
      if (working[i]! > localMed * 1.18 || working[i]! < localMed * 0.82) {
        cleaned[i] = localMed;
      }
    }
    working = cleaned;
  }

  {
    const next = new Array<number>(sides);
    for (let i = 0; i < sides; i++) {
      const a = working[(i - 1 + sides) % sides]!;
      const b = working[i]!;
      const c = working[(i + 1) % sides]!;
      const avg = (a + 2 * b + c) / 4;
      // Keep local peaks (lugs); only smooth valleys / noise
      next[i] = b >= a && b >= c ? Math.max(avg, b) : avg;
    }
    working = next;
  }

  // Tiny outward bias so the guide sits on the outer skin
  for (let i = 0; i < sides; i++) {
    working[i] = working[i]! + 0.5;
  }

  const sorted = [...working].filter((r) => r > 0).sort((a, b) => a - b);
  if (sorted.length < 8) return { ok: false, reason: "Outer contour too sparse." };
  const medianR = sorted[Math.floor(sorted.length / 2)]!;

  let variance = 0;
  for (const r of working) variance += (r - medianR) * (r - medianR);
  variance /= working.length;
  const relStd = Math.sqrt(variance) / medianR;

  const circleWorking: Circle = { cx: seedCx, cy: seedCy, r: medianR };
  if (options.inner && options.inner.r > 0) {
    const innerR = options.inner.r * scale;
    if (circleWorking.r <= innerR * 1.05) circleWorking.r = innerR * 1.25;
  }

  const circle: Circle = {
    cx: circleWorking.cx / scale,
    cy: circleWorking.cy / scale,
    r: circleWorking.r / scale,
  };
  circle.cx = clamp(circle.cx, circle.r * 0.1, fullW - circle.r * 0.1);
  circle.cy = clamp(circle.cy, circle.r * 0.1, fullH - circle.r * 0.1);

  if (!Number.isFinite(circle.cx) || !Number.isFinite(circle.cy) || !Number.isFinite(circle.r)) {
    return { ok: false, reason: "Invalid outer circle." };
  }

  const circleTol = options.circleTolerance ?? 0.025;
  if (relStd <= circleTol) {
    return {
      ok: true,
      shape: {
        circle,
        mode: "circle",
        sides,
        rotationDeg: 0,
        pointOffsets: Array.from({ length: sides }, () => ({ dx: 0, dy: 0 })),
      },
    };
  }

  const pointOffsets: Array<{ dx: number; dy: number }> = [];
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2;
    const edgeR = working[i]! / scale;
    const ex = circle.cx + Math.cos(t) * edgeR;
    const ey = circle.cy + Math.sin(t) * edgeR;
    const baseX = circle.cx + Math.cos(t) * circle.r;
    const baseY = circle.cy + Math.sin(t) * circle.r;
    pointOffsets.push({ dx: ex - baseX, dy: ey - baseY });
  }

  return {
    ok: true,
    shape: {
      circle,
      mode: "polygon",
      sides,
      rotationDeg: 0,
      pointOffsets,
    },
  };
}

function detectRingContour(
  source: CanvasImageSource,
  options: DetectRingOptions,
  kind: "inner" | "outer",
): DetectRingResult {
  if (kind === "outer") {
    return detectOuterByPolarEdge(source, options);
  }
  // --- Inner ring path only below ---
  const size = resolveSize(source, options.sourceWidth, options.sourceHeight);
  if (!size) return { ok: false, reason: "Image size unavailable." };
  const { fullW, fullH } = size;

  const maxWorking = options.maxWorkingSize ?? 420;
  const scale = Math.min(1, maxWorking / Math.max(fullW, fullH));
  const w = Math.max(48, Math.round(fullW * scale));
  const h = Math.max(48, Math.round(fullH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { ok: false, reason: "Could not read image pixels." };

  try {
    ctx.drawImage(source, 0, 0, w, h);
  } catch {
    return { ok: false, reason: "Could not draw image for scanning." };
  }

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Security error reading pixels";
    return { ok: false, reason: `Pixel read blocked (${msg}). Try re-uploading the image.` };
  }

  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }
  const smooth = boxBlur(gray, w, h, 1);

  let seedCx = (options.seedCenter?.cx ?? fullW / 2) * scale;
  let seedCy = (options.seedCenter?.cy ?? fullH / 2) * scale;
  if (options.outer) {
    seedCx = options.outer.cx * scale;
    seedCy = options.outer.cy * scale;
  }

  const halfMin = Math.min(w, h) / 2;
  let minR = Math.max(4, halfMin * 0.06);
  let maxR = halfMin * 0.85;
  if (options.expectedRadius && options.expectedRadius > 0) {
    const expectedR = options.expectedRadius * scale;
    // Keep a generous band around the AI seed while preventing a weak hole
    // edge from falling through to the much farther outer metal edge.
    minR = Math.max(minR, expectedR * 0.58);
    maxR = Math.min(maxR, expectedR * 1.42);
  }
  if (options.outer && options.outer.r > 0) {
    const outerR = options.outer.r * scale;
    maxR = Math.min(maxR, outerR * 0.94);
    minR = Math.max(minR, Math.min(outerR * 0.08, maxR * 0.4));
  }

  if (maxR - minR < 8) {
    return { ok: false, reason: "Search range too small — check ring sizes." };
  }

  const denseRays = 120;
  let pass1 = sampleEdgeRadii(smooth, w, h, seedCx, seedCy, minR, maxR, denseRays, findInnerEdgeAlongRay);
  pass1 = rejectRadialOutliers(pass1, 0.22);
  if (pass1.radii.length < 20) {
    return {
      ok: false,
      reason: `Too few edge hits (${pass1.radii.length}/${denseRays}).`,
    };
  }

  const center1 = robustCenter(pass1.points, seedCx, seedCy);
  seedCx = center1.cx;
  seedCy = center1.cy;
  const pass2 = sampleEdgeRadii(smooth, w, h, seedCx, seedCy, minR, maxR, denseRays, findInnerEdgeAlongRay);
  const cleanPass2 = rejectRadialOutliers(pass2, 0.2);
  if (cleanPass2.radii.length >= 20) {
    pass1 = cleanPass2;
    const center2 = robustCenter(cleanPass2.points, seedCx, seedCy);
    seedCx = center2.cx;
    seedCy = center2.cy;
  }

  const passMedian = medianNumber(pass1.radii);
  const passMad = medianNumber(pass1.radii.map((r) => Math.abs(r - passMedian)));
  const maxRadialError = Math.max(passMedian * 0.18, passMad * 4.5, 3);

  const sides = Math.max(8, Math.min(72, Math.round(options.polygonSides ?? 36)));
  const contourR = new Array<number>(sides).fill(0);
  const contourHits = new Array<number>(sides).fill(0);

  for (let i = 0; i < denseRays; i++) {
    const ang = (i / denseRays) * Math.PI * 2;
    const hit = findInnerEdgeAlongRay(
      smooth,
      w,
      h,
      seedCx,
      seedCy,
      Math.cos(ang),
      Math.sin(ang),
      minR,
      maxR,
    );
    if (hit === null) continue;
    if (Math.abs(hit - passMedian) > maxRadialError) continue;
    const bucket = Math.round((i / denseRays) * sides) % sides;
    contourR[bucket] += hit;
    contourHits[bucket] += 1;
  }

  for (let i = 0; i < sides; i++) {
    if (contourHits[i]! > 0) {
      contourR[i] = contourR[i]! / contourHits[i]!;
      continue;
    }
    const ang = (i / sides) * Math.PI * 2;
    const hit = findInnerEdgeAlongRay(
      smooth,
      w,
      h,
      seedCx,
      seedCy,
      Math.cos(ang),
      Math.sin(ang),
      minR,
      maxR,
    );
    if (hit !== null && Math.abs(hit - passMedian) <= maxRadialError) {
      contourR[i] = hit;
      contourHits[i] = 1;
    }
  }

  for (let i = 0; i < sides; i++) {
    if (contourHits[i]! > 0) continue;
    let prev = -1;
    let next = -1;
    for (let d = 1; d < sides; d++) {
      if (prev < 0 && contourHits[(i - d + sides) % sides]! > 0) prev = (i - d + sides) % sides;
      if (next < 0 && contourHits[(i + d) % sides]! > 0) next = (i + d) % sides;
      if (prev >= 0 && next >= 0) break;
    }
    if (prev >= 0 && next >= 0) {
      contourR[i] = (contourR[prev]! + contourR[next]!) / 2;
      contourHits[i] = 1;
    } else if (prev >= 0) {
      contourR[i] = contourR[prev]!;
      contourHits[i] = 1;
    } else if (next >= 0) {
      contourR[i] = contourR[next]!;
      contourHits[i] = 1;
    }
  }

  const validRadii = contourR.filter((_, i) => contourHits[i]! > 0);
  if (validRadii.length < Math.max(8, Math.floor(sides * 0.6))) {
    return { ok: false, reason: "Could not trace a full inner edge." };
  }

  // Remove isolated radial jumps before smoothing. A valid hole may be mildly
  // irregular, but it cannot jump toward the outer boundary for a few rays.
  const stableContour = stabilizeInnerContour(contourR);
  const working = smoothClosedSeries(stableContour, 2);
  const sorted = [...working].sort((a, b) => a - b);
  const medianR = sorted[Math.floor(sorted.length / 2)]!;
  if (!(medianR > 2)) return { ok: false, reason: "Detected radius too small." };

  let variance = 0;
  for (const r of working) variance += (r - medianR) * (r - medianR);
  variance /= working.length;
  const relStd = Math.sqrt(variance) / medianR;
  const circleTol = options.circleTolerance ?? 0.035;

  const circleWorking: Circle = { cx: seedCx, cy: seedCy, r: medianR };
  if (options.outer && options.outer.r > 0) {
    const outerR = options.outer.r * scale;
    if (circleWorking.r >= outerR * 0.98) circleWorking.r = outerR * 0.85;
  }

  const circle: Circle = {
    cx: circleWorking.cx / scale,
    cy: circleWorking.cy / scale,
    r: circleWorking.r / scale,
  };
  circle.cx = clamp(circle.cx, circle.r * 0.15, fullW - circle.r * 0.15);
  circle.cy = clamp(circle.cy, circle.r * 0.15, fullH - circle.r * 0.15);

  if (!Number.isFinite(circle.cx) || !Number.isFinite(circle.cy) || !Number.isFinite(circle.r)) {
    return { ok: false, reason: "Circle fit produced invalid values." };
  }

  if (relStd <= circleTol) {
    return {
      ok: true,
      shape: {
        circle,
        mode: "circle",
        sides,
        rotationDeg: 0,
        pointOffsets: Array.from({ length: sides }, () => ({ dx: 0, dy: 0 })),
      },
    };
  }

  const pointOffsets: Array<{ dx: number; dy: number }> = [];
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2;
    const edgeR = working[i]! / scale;
    const ex = circle.cx + Math.cos(t) * edgeR;
    const ey = circle.cy + Math.sin(t) * edgeR;
    const baseX = circle.cx + Math.cos(t) * circle.r;
    const baseY = circle.cy + Math.sin(t) * circle.r;
    pointOffsets.push({ dx: ex - baseX, dy: ey - baseY });
  }

  return {
    ok: true,
    shape: {
      circle,
      mode: "polygon",
      sides,
      rotationDeg: 0,
      pointOffsets,
    },
  };
}

function sampleEdgeRadii(
  gray: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  minR: number,
  maxR: number,
  rayCount: number,
  findEdge: EdgeFinder,
): { radii: number[]; points: Array<{ x: number; y: number }> } {
  const radii: number[] = [];
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < rayCount; i++) {
    const ang = (i / rayCount) * Math.PI * 2;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const hit = findEdge(gray, w, h, cx, cy, cos, sin, minR, maxR);
    if (hit === null) continue;
    radii.push(hit);
    points.push({ x: cx + cos * hit, y: cy + sin * hit });
  }
  return { radii, points };
}

function medianNumber(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function rejectRadialOutliers(
  samples: { radii: number[]; points: Array<{ x: number; y: number }> },
  maxRelativeDeviation: number,
): { radii: number[]; points: Array<{ x: number; y: number }> } {
  if (samples.radii.length < 8) return samples;
  const med = medianNumber(samples.radii);
  const spread = medianNumber(samples.radii.map((r) => Math.abs(r - med)));
  const tolerance = Math.max(3, med * maxRelativeDeviation, spread * 4.5);
  const radii: number[] = [];
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < samples.radii.length; i++) {
    const radius = samples.radii[i]!;
    if (Math.abs(radius - med) > tolerance) continue;
    radii.push(radius);
    points.push(samples.points[i]!);
  }
  return { radii, points };
}

function stabilizeInnerContour(values: number[]): number[] {
  if (values.length < 5) return values.slice();
  const globalMedian = medianNumber(values);
  const globalMad = medianNumber(values.map((r) => Math.abs(r - globalMedian)));
  const globalTolerance = Math.max(3, globalMedian * 0.16, globalMad * 4);
  const cleaned = values.slice();

  for (let i = 0; i < values.length; i++) {
    const local = [
      values[(i - 2 + values.length) % values.length]!,
      values[(i - 1 + values.length) % values.length]!,
      values[(i + 1) % values.length]!,
      values[(i + 2) % values.length]!,
    ];
    const localMedian = medianNumber(local);
    const radius = values[i]!;
    const localTolerance = Math.max(3, localMedian * 0.12);
    if (
      Math.abs(radius - globalMedian) > globalTolerance ||
      Math.abs(radius - localMedian) > localTolerance
    ) {
      cleaned[i] = localMedian;
    }
  }
  return cleaned;
}

function robustCenter(
  points: Array<{ x: number; y: number }>,
  fallbackCx: number,
  fallbackCy: number,
): { cx: number; cy: number } {
  if (points.length < 8) return { cx: fallbackCx, cy: fallbackCy };
  const xs = points.map((p) => p.x).sort((a, b) => a - b);
  const ys = points.map((p) => p.y).sort((a, b) => a - b);
  return {
    cx: xs[Math.floor(xs.length / 2)]!,
    cy: ys[Math.floor(ys.length / 2)]!,
  };
}

function smoothClosedSeries(values: number[], passes: number): number[] {
  let cur = values.slice();
  for (let p = 0; p < passes; p++) {
    const next = new Array<number>(cur.length);
    const n = cur.length;
    for (let i = 0; i < n; i++) {
      const a = cur[(i - 1 + n) % n]!;
      const b = cur[i]!;
      const c = cur[(i + 1) % n]!;
      next[i] = (a + 2 * b + c) / 4;
    }
    cur = next;
  }
  return cur;
}

/** First strong light→dark step (inner hole edge). */
function findInnerEdgeAlongRay(
  gray: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  cos: number,
  sin: number,
  minR: number,
  maxR: number,
): number | null {
  const samples = sampleRay(gray, w, h, cx, cy, cos, sin, minR, maxR);
  if (!samples) return null;
  const { gMin, gMax, range } = samples.stats;
  if (range < 12) return null;

  const dropThresh = Math.max(10, range * 0.12);
  const gradThresh = Math.max(6, range * 0.08);

  for (let i = 2; i < samples.list.length - 2; i++) {
    const before = (samples.list[i - 2]!.g + samples.list[i - 1]!.g) / 2;
    const after = (samples.list[i + 1]!.g + samples.list[i + 2]!.g) / 2;
    const drop = before - after;
    if (drop >= dropThresh && before > (gMin + gMax) / 2 - range * 0.1) {
      return samples.list[i]!.r;
    }
  }

  return firstGradientPeak(samples.list, gradThresh, "inner");
}

/**
 * Outer metal→background edge.
 * Combines strongest dark→light rise, dark-pixel extent, and outside-in crossing,
 * then picks the outermost valid hit so lug tips are not clipped.
 */
function findOuterEdgeAlongRay(
  gray: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  cos: number,
  sin: number,
  minR: number,
  maxR: number,
): number | null {
  const step = 0.5;
  const list: Array<{ r: number; g: number }> = [];
  for (let r = minR; r <= maxR; r += step) {
    const x = cx + cos * r;
    const y = cy + sin * r;
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) break;
    list.push({ r, g: sampleBilinear(gray, w, h, x, y) });
  }
  if (list.length < 12) return null;

  let gMin = Infinity;
  let gMax = -Infinity;
  for (const s of list) {
    if (s.g < gMin) gMin = s.g;
    if (s.g > gMax) gMax = s.g;
  }
  const range = gMax - gMin;
  if (range < 10) return null;

  const mid = (gMin + gMax) / 2;
  // Slightly stricter dark cut — stays on the metal skin, not background haze
  const darkCut = gMin + range * 0.32;
  const brightCut = gMin + range * 0.58;

  // 1) Strongest dark→light rise (metal → background), biased slightly outward
  let riseR: number | null = null;
  let bestScore = -1;
  for (let i = 4; i < list.length - 4; i++) {
    const before =
      (list[i - 4]!.g + list[i - 3]!.g + list[i - 2]!.g + list[i - 1]!.g) / 4;
    const after =
      (list[i + 1]!.g + list[i + 2]!.g + list[i + 3]!.g + list[i + 4]!.g) / 4;
    const rise = after - before;
    if (rise < range * 0.1) continue;
    if (before > mid + range * 0.12) continue;
    // Prefer edges that start from truly dark metal
    if (before > darkCut + range * 0.15) continue;
    const radiusBias = 1 + 0.2 * ((list[i]!.r - minR) / Math.max(1, maxR - minR));
    const score = rise * radiusBias;
    if (score > bestScore) {
      bestScore = score;
      riseR = list[i]!.r;
    }
  }

  // 2) Outermost dark metal pixel (soft / protruding lobes)
  let darkExtent: number | null = null;
  let darkStreak = 0;
  let lastDark: number | null = null;
  for (const s of list) {
    if (s.g <= darkCut) {
      darkStreak++;
      lastDark = s.r;
    } else if (darkStreak >= 2) {
      darkExtent = lastDark;
      darkStreak = 0;
    } else {
      darkStreak = 0;
    }
  }
  if (darkStreak >= 2 && lastDark !== null) darkExtent = lastDark;

  // 3) From outside inward: first crossing into dark metal
  let fromOutside: number | null = null;
  for (let i = list.length - 2; i >= 1; i--) {
    if (list[i + 1]!.g >= brightCut && list[i]!.g < brightCut) {
      fromOutside = list[i]!.r;
      break;
    }
  }

  const candidates = [riseR, darkExtent, fromOutside].filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (candidates.length === 0) return null;

  // Prefer rise when darkExtent is only noise-farther (< 4% beyond rise)
  if (riseR !== null && darkExtent !== null) {
    if (darkExtent > riseR * 1.04) return darkExtent;
    return Math.max(riseR, Math.min(darkExtent, riseR * 1.02));
  }

  return Math.max(...candidates);
}

function sampleRay(
  gray: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  cos: number,
  sin: number,
  minR: number,
  maxR: number,
): { list: Array<{ r: number; g: number }>; stats: { gMin: number; gMax: number; range: number } } | null {
  const list: Array<{ r: number; g: number }> = [];
  for (let r = minR; r <= maxR; r += 1) {
    const x = cx + cos * r;
    const y = cy + sin * r;
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) break;
    list.push({ r, g: sampleBilinear(gray, w, h, x, y) });
  }
  if (list.length < 10) return null;

  let gMin = Infinity;
  let gMax = -Infinity;
  for (const s of list) {
    if (s.g < gMin) gMin = s.g;
    if (s.g > gMax) gMax = s.g;
  }
  return { list, stats: { gMin, gMax, range: gMax - gMin } };
}

function firstGradientPeak(
  list: Array<{ r: number; g: number }>,
  gradThresh: number,
  preference: "inner" | "outer",
): number | null {
  let bestI = -1;
  let bestGrad = 0;
  for (let i = 2; i < list.length - 2; i++) {
    const grad = Math.abs(list[i + 1]!.g - list[i - 1]!.g);
    const isPeak =
      grad >= Math.abs(list[i]!.g - list[i - 2]!.g) &&
      grad >= Math.abs(list[i + 2]!.g - list[i]!.g);
    if (!isPeak || grad < gradThresh) continue;
    if (preference === "outer") {
      // Prefer later (outer) peaks
      if (grad >= bestGrad * 0.85) {
        bestGrad = Math.max(bestGrad, grad);
        bestI = i;
      }
    } else if (bestI < 0 || list[i]!.r < list[bestI]!.r + 4) {
      bestGrad = grad;
      bestI = i;
      if (grad >= gradThresh * 1.4) return list[i]!.r;
    }
  }
  return bestI >= 0 ? list[bestI]!.r : null;
}

function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius <= 0) return src;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const span = radius * 2 + 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        sum += src[y * w + xx]!;
        n++;
      }
      tmp[y * w + x] = sum / (n || span);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        sum += tmp[yy * w + x]!;
        n++;
      }
      out[y * w + x] = sum / (n || span);
    }
  }
  return out;
}

function sampleBilinear(map: Float32Array, w: number, h: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const v00 = map[y0 * w + x0] ?? 0;
  const v10 = map[y0 * w + x1] ?? 0;
  const v01 = map[y1 * w + x0] ?? 0;
  const v11 = map[y1 * w + x1] ?? 0;
  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return (lo + hi) / 2;
  return Math.min(hi, Math.max(lo, v));
}

function resolveSize(
  source: CanvasImageSource,
  sourceWidth?: number,
  sourceHeight?: number,
): { fullW: number; fullH: number } | null {
  if (sourceWidth && sourceHeight && sourceWidth > 0 && sourceHeight > 0) {
    return { fullW: sourceWidth, fullH: sourceHeight };
  }
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    const fullW = source.naturalWidth || source.width;
    const fullH = source.naturalHeight || source.height;
    return fullW > 0 && fullH > 0 ? { fullW, fullH } : null;
  }
  if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
    return source.width > 0 && source.height > 0 ? { fullW: source.width, fullH: source.height } : null;
  }
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return source.width > 0 && source.height > 0 ? { fullW: source.width, fullH: source.height } : null;
  }
  return null;
}
