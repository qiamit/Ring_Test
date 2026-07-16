import type { Circle } from "@/lib/analysis";
import { T_LABELS } from "@/lib/analysis";
import {
  detectInnerRingFromImage,
  detectOuterRingFromImage,
  type DetectedRingShape,
} from "@/lib/analysis/detect-ring";
import type { AiRingGuidance, AiSector } from "@/lib/ai/ring-schema";

export type RefinedRingShape = {
  circle: Circle;
  mode: "circle" | "polygon";
  sides: number;
  rotationDeg: number;
  pointOffsets: Array<{ dx: number; dy: number }>;
};

export type RefinedDiameterLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type RefinedScale = {
  line: RefinedDiameterLine;
  distanceMm: number;
  mmPerPx: number;
} | null;

export type RefinedAiGeometry = {
  inner: RefinedRingShape;
  outer: RefinedRingShape;
  diamLines: RefinedDiameterLine[];
  thicknessAngleOffsetsDeg: number[];
  scale: RefinedScale;
  confidence: number;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

function angleDiffDeg(a: number, b: number): number {
  let d = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  if (d > 180) d = 360 - d;
  return d;
}

function inExcludeSector(angleDeg: number, sectors: AiSector[]): boolean {
  const a = normalizeDeg(angleDeg);
  for (const s of sectors) {
    const start = normalizeDeg(s.startDeg);
    const end = normalizeDeg(s.endDeg);
    if (start <= end) {
      if (a >= start && a <= end) return true;
    } else if (a >= start || a <= end) {
      return true;
    }
  }
  return false;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function toRefined(shape: DetectedRingShape, forceCircle = false): RefinedRingShape {
  if (forceCircle || shape.mode === "circle") {
    return {
      circle: { ...shape.circle },
      mode: "circle",
      sides: shape.sides,
      rotationDeg: 0,
      pointOffsets: Array.from({ length: shape.sides }, () => ({ dx: 0, dy: 0 })),
    };
  }
  return {
    circle: { ...shape.circle },
    mode: shape.mode,
    sides: shape.sides,
    rotationDeg: shape.rotationDeg,
    pointOffsets: shape.pointOffsets.map((p) => ({ dx: p.dx, dy: p.dy })),
  };
}

function circleShape(cx: number, cy: number, r: number, sides = 48): RefinedRingShape {
  return {
    circle: { cx, cy, r },
    mode: "circle",
    sides,
    rotationDeg: 0,
    pointOffsets: Array.from({ length: sides }, () => ({ dx: 0, dy: 0 })),
  };
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

function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius <= 0) return src;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += src[y * w + clamp(x + k, 0, w - 1)]!;
        n++;
      }
      tmp[y * w + x] = sum / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += tmp[clamp(y + k, 0, h - 1) * w + x]!;
        n++;
      }
      out[y * w + x] = sum / n;
    }
  }
  return out;
}

function readGray(
  source: CanvasImageSource,
  fullW: number,
  fullH: number,
  maxWorking = 640,
): { gray: Float32Array; w: number; h: number; scale: number } {
  const scale = Math.min(1, maxWorking / Math.max(fullW, fullH));
  const w = Math.max(96, Math.round(fullW * scale));
  const h = Math.max(96, Math.round(fullH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not read image for refinement.");
  // Stretch source into the declared editor size so coords match canvas geometry.
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }
  return { gray: boxBlur(gray, w, h, 1), w, h, scale };
}

/** First strong light→dark (hole → metal). No seed-radius bias. */
function firstInnerEdge(
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
  const list: Array<{ r: number; g: number }> = [];
  for (let r = minR; r <= maxR; r += 0.5) {
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
  const range = gMax - gMin;
  if (range < 8) return null;
  const mid = (gMin + gMax) / 2;
  const dropThresh = Math.max(6, range * 0.1);
  for (let i = 2; i < list.length - 2; i++) {
    const before = (list[i - 2]!.g + list[i - 1]!.g) / 2;
    const after = (list[i + 1]!.g + list[i + 2]!.g) / 2;
    if (before - after >= dropThresh && before > mid - range * 0.15) {
      return list[i]!.r;
    }
  }
  return null;
}

/**
 * Lock centre to the actual ring hole using dark-metal annulus + hole edges.
 * Never use global brightness (that snaps to white background / top-left).
 */
function lockCentreToRingHole(
  gray: Float32Array,
  w: number,
  h: number,
  aiCx: number,
  aiCy: number,
): { cx: number; cy: number; innerR: number | null } {
  const imgCx = w / 2;
  const imgCy = h / 2;
  // Prefer image centre when AI centre is far — ring photos are usually centered.
  let cx = aiCx;
  let cy = aiCy;
  if (Math.hypot(aiCx - imgCx, aiCy - imgCy) > Math.min(w, h) * 0.22) {
    cx = imgCx;
    cy = imgCy;
  }

  // Dark-metal centroid near seed (the ring body), ignoring bright background.
  {
    const searchR = Math.min(w, h) * 0.42;
    let sumW = 0;
    let sumX = 0;
    let sumY = 0;
    const x0 = Math.max(1, Math.floor(cx - searchR));
    const x1 = Math.min(w - 2, Math.ceil(cx + searchR));
    const y0 = Math.max(1, Math.floor(cy - searchR));
    const y1 = Math.min(h - 2, Math.ceil(cy + searchR));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > searchR * searchR) continue;
        const g = gray[y * w + x]!;
        // Dark metal only (not bright background / hole).
        if (g > 95) continue;
        const weight = (95 - g) * (95 - g);
        sumW += weight;
        sumX += x * weight;
        sumY += y * weight;
      }
    }
    if (sumW > 1000) {
      cx = sumX / sumW;
      cy = sumY / sumW;
    }
  }

  // Hole-edge re-centre: rays from current centre → first light→dark.
  const maxR = Math.min(w, h) * 0.45;
  const pts: Array<{ x: number; y: number; r: number }> = [];
  for (let i = 0; i < 96; i++) {
    const ang = (i / 96) * Math.PI * 2;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const hit = firstInnerEdge(gray, w, h, cx, cy, cos, sin, 4, maxR);
    if (hit === null) continue;
    pts.push({ x: cx + cos * hit, y: cy + sin * hit, r: hit });
  }
  if (pts.length >= 16) {
    const xs = pts.map((p) => p.x).sort((a, b) => a - b);
    const ys = pts.map((p) => p.y).sort((a, b) => a - b);
    cx = xs[Math.floor(xs.length / 2)]!;
    cy = ys[Math.floor(ys.length / 2)]!;
    // Second pass from refined centre
    const pts2: Array<{ x: number; y: number; r: number }> = [];
    for (let i = 0; i < 96; i++) {
      const ang = (i / 96) * Math.PI * 2;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const hit = firstInnerEdge(gray, w, h, cx, cy, cos, sin, 4, maxR);
      if (hit === null) continue;
      pts2.push({ x: cx + cos * hit, y: cy + sin * hit, r: hit });
    }
    if (pts2.length >= 16) {
      const xs2 = pts2.map((p) => p.x).sort((a, b) => a - b);
      const ys2 = pts2.map((p) => p.y).sort((a, b) => a - b);
      cx = xs2[Math.floor(xs2.length / 2)]!;
      cy = ys2[Math.floor(ys2.length / 2)]!;
      const radii = pts2.map((p) => p.r);
      const med = median(radii);
      const kept = radii.filter((r) => Math.abs(r - med) <= Math.max(3, med * 0.18));
      return { cx, cy, innerR: kept.length >= 10 ? median(kept) : med };
    }
    const radii = pts.map((p) => p.r);
    return { cx, cy, innerR: median(radii) };
  }

  return { cx, cy, innerR: null };
}

function pickDiameterAngles(
  guidance: AiRingGuidance,
  exclude: AiSector[],
): [number, number] {
  const candidates = [...guidance.diameterAnglesDeg];
  let bestA = 0;
  let bestB = 90;
  let bestScore = -1;
  const pool = candidates.length >= 2 ? candidates : [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]!;
      const b = pool[j]!;
      if (inExcludeSector(a, exclude) || inExcludeSector(a + 180, exclude)) continue;
      if (inExcludeSector(b, exclude) || inExcludeSector(b + 180, exclude)) continue;
      const ortho = 90 - Math.abs(angleDiffDeg(a, b) - 90);
      if (ortho > bestScore) {
        bestScore = ortho;
        bestA = a;
        bestB = b;
      }
    }
  }
  if (bestScore < 0) return [0, 90];
  return [bestA, bestB];
}

function diameterAtAngle(ring: Circle, angleDeg: number): RefinedDiameterLine {
  const a1 = (angleDeg * Math.PI) / 180;
  const a2 = ((angleDeg + 180) * Math.PI) / 180;
  return {
    x1: ring.cx + Math.cos(a2) * ring.r,
    y1: ring.cy + Math.sin(a2) * ring.r,
    x2: ring.cx + Math.cos(a1) * ring.r,
    y2: ring.cy + Math.sin(a1) * ring.r,
  };
}

function refineScale(
  guidance: AiRingGuidance,
  fullW: number,
  fullH: number,
): RefinedScale {
  const s = guidance.scale;
  if (!s.present || !s.tickA || !s.tickB || !s.distanceMm || s.distanceMm <= 0) return null;
  if (s.confidence < 0.55) return null;
  const x1 = s.tickA.x * fullW;
  const y1 = s.tickA.y * fullH;
  const x2 = s.tickB.x * fullW;
  const y2 = s.tickB.y * fullH;
  const px = Math.hypot(x2 - x1, y2 - y1);
  if (px < 8) return null;
  const mmPerPx = s.distanceMm / px;
  if (!(mmPerPx > 0) || !Number.isFinite(mmPerPx)) return null;
  return {
    line: { x1, y1, x2, y2 },
    distanceMm: s.distanceMm,
    mmPerPx,
  };
}

/**
 * AI supplies soft centre / scale / diameter hints.
 * Geometry is locked to the IMAGE ring (dark metal + hole edges) so overlays
 * land on the specimen — not on bright background / wrong analysis area.
 */
export function refineAiRingGeometry(
  source: CanvasImageSource,
  guidance: AiRingGuidance,
  sourceWidth: number,
  sourceHeight: number,
): RefinedAiGeometry {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Invalid image dimensions for refinement.");
  }

  // Always use editor-declared size so detection coords match canvas draw coords.
  // (HTMLImageElement.naturalWidth may differ after rotate/crop/pixel-update.)
  const fullW = sourceWidth;
  const fullH = sourceHeight;

  const { gray, w, h, scale } = readGray(source, fullW, fullH, 640);
  const inv = 1 / scale;
  const minDimFull = Math.min(fullW, fullH);
  const exclude = guidance.excludeSectors ?? [];

  const aiCx = clamp(guidance.center.x, 0.05, 0.95) * w;
  const aiCy = clamp(guidance.center.y, 0.05, 0.95) * h;
  const locked = lockCentreToRingHole(gray, w, h, aiCx, aiCy);

  const seedCxFull = locked.cx * inv;
  const seedCyFull = locked.cy * inv;
  const expectedInner =
    locked.innerR !== null
      ? locked.innerR * inv
      : clamp(guidance.innerRadiusNorm * minDimFull, minDimFull * 0.08, minDimFull * 0.4);

  const innerDet = detectInnerRingFromImage(source, {
    seedCenter: { cx: seedCxFull, cy: seedCyFull },
    expectedRadius: expectedInner,
    sourceWidth: fullW,
    sourceHeight: fullH,
    maxWorkingSize: 720,
    polygonSides: 36,
    circleTolerance: 0.14,
  });

  let inner: RefinedRingShape;
  if (innerDet.ok) {
    inner = toRefined(innerDet.shape, true);
  } else if (locked.innerR !== null) {
    inner = circleShape(seedCxFull, seedCyFull, locked.innerR * inv, 48);
  } else {
    inner = circleShape(seedCxFull, seedCyFull, expectedInner, 48);
  }

  const outerDet = detectOuterRingFromImage(source, {
    inner: inner.circle,
    seedCenter: { cx: inner.circle.cx, cy: inner.circle.cy },
    sourceWidth: fullW,
    sourceHeight: fullH,
    maxWorkingSize: 720,
    polygonSides: 48,
    circleTolerance: 0.14,
  });

  let outer: RefinedRingShape;
  if (outerDet.ok) {
    outer = toRefined(outerDet.shape, true);
  } else {
    const aiOuterHint = guidance.outerRadiusNorm * minDimFull;
    outer = circleShape(
      inner.circle.cx,
      inner.circle.cy,
      clamp(aiOuterHint, inner.circle.r * 1.12, Math.min(minDimFull * 0.48, inner.circle.r * 1.5)),
      48,
    );
  }

  // Concentric measurement frame on the detected hole centre.
  outer = circleShape(inner.circle.cx, inner.circle.cy, outer.circle.r, outer.sides);

  const maxR = minDimFull * 0.48;
  if (outer.circle.r > maxR) {
    outer = circleShape(inner.circle.cx, inner.circle.cy, maxR, 48);
  }
  if (outer.circle.r <= inner.circle.r * 1.08) {
    outer = circleShape(inner.circle.cx, inner.circle.cy, inner.circle.r * 1.28, 48);
  }

  const [a1, a2] = pickDiameterAngles(guidance, exclude);
  const diamLines = [diameterAtAngle(outer.circle, a1), diameterAtAngle(outer.circle, a2)];
  const thicknessAngleOffsetsDeg = Array.from({ length: T_LABELS.length }, () => 0);
  const scaleCal = refineScale(guidance, sourceWidth, sourceHeight);

  return {
    inner,
    outer,
    diamLines,
    thicknessAngleOffsetsDeg,
    scale: scaleCal,
    confidence: guidance.confidence,
  };
}
