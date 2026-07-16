/**
 * Shared AI ring analysis guidance schema (normalized 0–1 image coords).
 */

const IS1786_THICKNESS_ANGLES_DEG = [270, 315, 0, 45, 90, 135, 180, 225] as const;
export type AiSector = {
  /** Start angle in degrees (0 = +X / east, CCW). */
  startDeg: number;
  /** End angle in degrees. */
  endDeg: number;
  reason?: string;
};

export type AiScaleGuidance = {
  present: boolean;
  /** Known distance between ticks in mm (e.g. 10). */
  distanceMm: number | null;
  /** Tick A in normalized image coords [0,1]. */
  tickA: { x: number; y: number } | null;
  /** Tick B in normalized image coords [0,1]. */
  tickB: { x: number; y: number } | null;
  confidence: number;
  label?: string | null;
};

export type AiRingGuidance = {
  center: { x: number; y: number };
  /** Approximate inner radius as fraction of min(imageW, imageH). */
  innerRadiusNorm: number;
  /** Approximate outer radius as fraction of min(imageW, imageH). */
  outerRadiusNorm: number;
  /** Contaminated / uneven sectors to ignore while fitting. */
  excludeSectors: AiSector[];
  /** Preferred diameter angles (degrees) through centre; typically 2 orthogonal. */
  diameterAnglesDeg: number[];
  /** Preferred thickness sample angles (degrees). */
  thicknessAnglesDeg: number[];
  scale: AiScaleGuidance;
  confidence: number;
  notes?: string;
};

export const AI_RING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "center",
    "innerRadiusNorm",
    "outerRadiusNorm",
    "excludeSectors",
    "diameterAnglesDeg",
    "thicknessAnglesDeg",
    "scale",
    "confidence",
    "notes",
  ],
  properties: {
    center: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y"],
      properties: {
        x: { type: "number" },
        y: { type: "number" },
      },
    },
    innerRadiusNorm: { type: "number" },
    outerRadiusNorm: { type: "number" },
    excludeSectors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["startDeg", "endDeg", "reason"],
        properties: {
          startDeg: { type: "number" },
          endDeg: { type: "number" },
          reason: { type: "string" },
        },
      },
    },
    diameterAnglesDeg: {
      type: "array",
      items: { type: "number" },
    },
    thicknessAnglesDeg: {
      type: "array",
      items: { type: "number" },
    },
    scale: {
      type: "object",
      additionalProperties: false,
      required: ["present", "distanceMm", "tickA", "tickB", "confidence", "label"],
      properties: {
        present: { type: "boolean" },
        distanceMm: { type: "number" },
        tickA: {
          type: "object",
          additionalProperties: false,
          required: ["x", "y"],
          properties: { x: { type: "number" }, y: { type: "number" } },
        },
        tickB: {
          type: "object",
          additionalProperties: false,
          required: ["x", "y"],
          properties: { x: { type: "number" }, y: { type: "number" } },
        },
        confidence: { type: "number" },
        label: { type: "string" },
      },
    },
    confidence: { type: "number" },
    notes: { type: "string" },
  },
} as const;

/**
 * Gemini responseSchema rejects OpenAI-strict fields like `additionalProperties`.
 */
export function toGeminiResponseSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiResponseSchema);
  if (!schema || typeof schema !== "object") return schema;

  const src = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (key === "additionalProperties") continue;
    out[key] = toGeminiResponseSchema(value);
  }
  return out;
}

/** Gemini-safe copy of the ring analysis schema (no additionalProperties; nullable scale fields). */
export const AI_RING_GEMINI_SCHEMA = (() => {
  const base = toGeminiResponseSchema(AI_RING_JSON_SCHEMA) as Record<string, unknown>;
  const props = (base.properties ?? {}) as Record<string, unknown>;
  const scale = (props.scale ?? {}) as Record<string, unknown>;
  const scaleProps = (scale.properties ?? {}) as Record<string, unknown>;

  const markNullable = (node: unknown): Record<string, unknown> => {
    if (!node || typeof node !== "object") return { type: "string", nullable: true };
    return { ...(node as Record<string, unknown>), nullable: true };
  };

  scaleProps.distanceMm = markNullable(scaleProps.distanceMm);
  scaleProps.tickA = markNullable(scaleProps.tickA);
  scaleProps.tickB = markNullable(scaleProps.tickB);
  scaleProps.label = markNullable(scaleProps.label);
  scale.properties = scaleProps;
  props.scale = scale;
  base.properties = props;
  return base;
})();

export const AI_RING_ANALYSIS_PROMPT = `You are analyzing a photo of a metal rebar/ring specimen for dimensional measurement.

Return ONLY JSON matching the schema. Coordinates are NORMALIZED to [0,1] where (0,0) is top-left and (1,1) is bottom-right.
Radii (innerRadiusNorm, outerRadiusNorm) are fractions of min(imageWidth, imageHeight).

Rules:
1. Locate the bright circular HOLE centre precisely (center.x / center.y). This seed is critical — aim for the true centre of the light hole.
2. Estimate innerRadiusNorm tightly to the metal INNER edge of the hole (first light→dark metal edge). Do NOT under-estimate into the hole and do NOT jump to the outer skin.
3. Estimate outerRadiusNorm to the main OUTER metal BODY radius BETWEEN lugs (not lug tips).
4. List lug / protrusion / shadow / glare sectors in excludeSectors (degrees, 0 = east / +X, CCW). These must NOT be used for diameter.
5. Suggest exactly 2 orthogonal diameterAnglesDeg through the centre on CLEAN opposite body edges (between lugs, never through lug tips).
6. thicknessAnglesDeg: return the fixed IS 1786 set [270, 315, 0, 45, 90, 135, 180, 225] (45° steps). Do not shift them.
7. If a ruler/scale is clearly visible with readable major ticks, set scale.present=true with two major tick points and distanceMm. Otherwise present=false and null ticks.
8. confidence is 0–1 for overall ring detection quality.

Do not invent a scale if unsure. Prefer an accurate hole centre and body radii over creative polygons.`;

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function pointOrNull(v: unknown): { x: number; y: number } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!("x" in o) || !("y" in o)) return null;
  return { x: clamp01(num(o.x)), y: clamp01(num(o.y)) };
}

/** Parse + sanitize model JSON into AiRingGuidance. Throws on unusable payload. */
export function parseAiRingGuidance(raw: unknown): AiRingGuidance {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI returned empty guidance.");
  }
  const o = raw as Record<string, unknown>;
  const centerObj = (o.center as Record<string, unknown> | undefined) ?? {};
  const center = {
    x: clamp01(num(centerObj.x, 0.5)),
    y: clamp01(num(centerObj.y, 0.5)),
  };

  let innerRadiusNorm = num(o.innerRadiusNorm, 0.2);
  let outerRadiusNorm = num(o.outerRadiusNorm, 0.35);
  innerRadiusNorm = Math.min(0.7, Math.max(0.02, innerRadiusNorm));
  outerRadiusNorm = Math.min(0.95, Math.max(innerRadiusNorm * 1.05, outerRadiusNorm));

  const excludeSectors: AiSector[] = [];
  if (Array.isArray(o.excludeSectors)) {
    for (const s of o.excludeSectors) {
      if (!s || typeof s !== "object") continue;
      const sec = s as Record<string, unknown>;
      excludeSectors.push({
        startDeg: num(sec.startDeg),
        endDeg: num(sec.endDeg),
        reason: typeof sec.reason === "string" ? sec.reason : undefined,
      });
    }
  }

  const diameterAnglesDeg = Array.isArray(o.diameterAnglesDeg)
    ? o.diameterAnglesDeg.map((a) => num(a)).filter((a) => Number.isFinite(a)).slice(0, 4)
    : [0, 90];
  while (diameterAnglesDeg.length < 2) {
    diameterAnglesDeg.push(diameterAnglesDeg.length === 0 ? 0 : 90);
  }

  // Thickness is always the fixed IS 1786 45° grid — ignore model jitter.
  const thicknessAnglesDeg = [...IS1786_THICKNESS_ANGLES_DEG];
  const scaleRaw = (o.scale as Record<string, unknown> | undefined) ?? {};
  const distanceRaw =
    scaleRaw.distanceMm === null || scaleRaw.distanceMm === undefined
      ? null
      : num(scaleRaw.distanceMm, NaN);
  const scale: AiScaleGuidance = {
    present: scaleRaw.present === true,
    distanceMm: distanceRaw !== null && Number.isFinite(distanceRaw) ? distanceRaw : null,
    tickA: pointOrNull(scaleRaw.tickA),
    tickB: pointOrNull(scaleRaw.tickB),
    confidence: clamp01(num(scaleRaw.confidence, 0)),
    label: typeof scaleRaw.label === "string" ? scaleRaw.label : null,
  };
  if (
    !scale.present ||
    !scale.tickA ||
    !scale.tickB ||
    !(scale.distanceMm !== null && scale.distanceMm > 0) ||
    scale.confidence < 0.55
  ) {
    scale.present = false;
    scale.tickA = null;
    scale.tickB = null;
    scale.distanceMm = null;
  }

  const confidence = clamp01(num(o.confidence, 0.5));
  if (confidence < 0.25) {
    throw new Error("AI confidence too low to apply analysis.");
  }

  return {
    center,
    innerRadiusNorm,
    outerRadiusNorm,
    excludeSectors,
    diameterAnglesDeg,
    thicknessAnglesDeg,
    scale,
    confidence,
    notes: typeof o.notes === "string" ? o.notes : undefined,
  };
}

export function parseAiRingGuidanceFromText(text: string): AiRingGuidance {
  const trimmed = text.trim();
  // Strip markdown fences if present
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced ? fenced[1]!.trim() : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI response was not valid JSON.");
    parsed = JSON.parse(jsonText.slice(start, end + 1));
  }
  return parseAiRingGuidance(parsed);
}
