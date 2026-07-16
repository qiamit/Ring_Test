import type { Circle, DiameterBox, RingResult } from "@/lib/analysis";

export type EditorShapeConfig = {
  mode: "circle" | "polygon";
  sides: number;
  rotationDeg: number;
  pointOffsets: Array<{ dx: number; dy: number }>;
};

export type EditorDiameterLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type EditorImageFilter = {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  sepia: number;
  invert: number;
};

export type EditorGeometryDraft = {
  inner: Circle | null;
  outer: Circle | null;
  diam: DiameterBox | null;
  diamLines: EditorDiameterLine[];
  /** Calibration lines — pair with calibRefMm to derive mm/px (not sample diameter). */
  calibLines?: EditorDiameterLine[];
  /** Known length (mm) of the calibration line drawn on the image. */
  calibRefMm?: number | null;
  /** User-set scale used for diameter / thickness conversion. */
  scaleMmPerPx?: number | null;
  innerShape: EditorShapeConfig;
  outerShape: EditorShapeConfig;
  thicknessAngleOffsetsDeg: number[];
  thicknessDeltaPx: number[];
  imageFilter: EditorImageFilter;
  scale: number;
};

export type NewTestDraft = {
  imageSrc: string | null;
  imgDim: { w: number; h: number };
  sampleDescription: string;
  sampleDiameter: string;
  batchNumber: string;
  mfgDate: string;
  testerName: string;
  testDate: string;
  testTime: string;
  observations: string;
  geometry: EditorGeometryDraft | null;
  result: RingResult | null;
};

const STORAGE_KEY = "ring-test:new-test-draft:v1";

/** Survives client-side route changes within the same tab. */
let memoryDraft: NewTestDraft | null = null;

export function loadNewTestDraft(): NewTestDraft | null {
  if (memoryDraft) return memoryDraft;
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NewTestDraft;
    memoryDraft = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function saveNewTestDraft(draft: NewTestDraft): void {
  memoryDraft = draft;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Quota exceeded (large image) — memory draft still keeps work during navigation.
  }
}

export function clearNewTestDraft(): void {
  memoryDraft = null;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
