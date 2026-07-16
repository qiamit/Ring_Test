"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type Circle,
  type DiameterBox,
  type RingResult,
  T_LABELS,
  analyseRing,
  computeThicknessPairs,
  suggestInitialCircles,
} from "@/lib/analysis";
import { detectInnerRingFromImage, detectOuterRingFromImage } from "@/lib/analysis/detect-ring";
import { refineAiRingGeometry } from "@/lib/analysis/ai-ring-refinement";
import { encodeImageForAiAnalysis } from "@/lib/ai/encode-image";
import type { AiRingGuidance } from "@/lib/ai/ring-schema";
import type { EditorGeometryDraft } from "@/lib/new-test-draft";

export type EditMode = "inner" | "outer" | "diam" | "mmpx" | "thick" | "view";
type InnerShapeMode = "circle" | "polygon";

export type RingEditorToolbarApi = {
  openMmpx: () => void;
  runAiAnalysis: () => void;
};

export type RingEditorToolbarState = {
  detectingAi: boolean;
  aiStatus: string | null;
  mmpxActive: boolean;
  imgReady: boolean;
  aiAnalysisEnabled: boolean;
};

interface Style {
  inner: { color: string; width: number };
  outer: { color: string; width: number };
  diam: { color: string; width: number };
  thick: { color: string; width: number };
}

const MMPX_LINE_COLOR = "#22d3ee";
const DEFAULT_STYLE: Style = {
  inner: { color: "#fde047", width: 1 },
  outer: { color: "#f472b6", width: 1 },
  diam: { color: "#fb923c", width: 1 },
  thick: { color: "#4ade80", width: 1 },
};

interface RingEditorProps {
  imageSrc: string | null;
  /** image natural width / height in pixels — needed for hit-testing */
  imageWidth: number;
  imageHeight: number;
  sampleDiameterMm: number | null;
  mmPerPxOverride: number | null;
  angularCorrectionDeg: number;
  thicknessOuterGapPx?: number;
  thicknessInnerGapPx?: number;
  style?: Partial<Style>;
  /** Restore rings / filters after navigating away from New Test. */
  initialGeometry?: EditorGeometryDraft | null;
  onResult?: (result: RingResult | null) => void;
  /** Notifies the parent of the canvas state so it can be persisted on save. */
  onStateChange?: (state: {
    inner: Circle | null;
    outer: Circle | null;
    diam: DiameterBox | null;
  }) => void;
  onGeometryChange?: (geometry: EditorGeometryDraft) => void;
  onMetricsChange?: (metrics: {
    mmPerPx: number;
    thicknessMean: number | null;
    thicknessPoints: number;
    fpAreaPx2: number | null;
    tmAreaPx2: number | null;
    totalAreaPx2: number | null;
    tmAreaPercent: number | null;
    diameterLineCount: number;
    diameterSinglePx: number | null;
    diameterAveragePx: number | null;
    diameterSingleMm: number | null;
    diameterAverageMm: number | null;
    thicknessEnabled: boolean;
  }) => void;
  cameraOn?: boolean;
  cameraVideoRef?: React.RefObject<HTMLVideoElement | null>;
  onDeleteImage?: () => void;
  extraControls?: React.ReactNode;
  saveControl?: React.ReactNode;
  snapshotRef?: React.MutableRefObject<(() => string | null) | null>;
  onImageReplace?: (nextImageSrc: string, dims: { w: number; h: number }) => void;
  /** Show AI Analysis tool when Super Admin enabled AI for this organization. */
  aiAnalysisEnabled?: boolean;
  /** Imperative mm/px + AI actions for parent header toolbar. */
  toolbarApiRef?: React.MutableRefObject<RingEditorToolbarApi | null>;
  onToolbarStateChange?: (state: RingEditorToolbarState) => void;
  /** Hide Upload/Camera/mm/px/AI from the left tools sidebar (shown in parent header). */
  hideHeaderToolsInSidebar?: boolean;
  /** Overlay rendered at the bottom-right of the canvas viewport. */
  canvasOverlay?: React.ReactNode;
}

type DragHandle =
  | { kind: "move"; ring: "inner" | "outer" | "diam" }
  | { kind: "resize"; ring: "inner" | "outer" }
  | { kind: "poly-point"; index: number }
  | { kind: "poly-edge"; ring: "inner" | "outer"; indices: number[] }
  | { kind: "diam-point"; point: "start" | "end"; lineIndex: number }
  | { kind: "calib-point"; point: "start" | "end"; lineIndex: number }
  | { kind: "diam-handle"; corner: "tl" | "tr" | "bl" | "br" }
  | null;

const HANDLE_RADIUS = 6;
const MIN_INNER_RADIUS = 4;
const GRID_STEP_PX = 25;
const GRID_MAJOR_EVERY = 5;
const DEFAULT_IMAGE_FILTER = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  invert: 0,
};
type ImageFilter = typeof DEFAULT_IMAGE_FILTER;

interface InnerShapeConfig {
  mode: InnerShapeMode;
  sides: number;
  rotationDeg: number;
  pointOffsets: Array<{ dx: number; dy: number }>;
}
interface DiameterLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const DEFAULT_INNER_SHAPE: InnerShapeConfig = {
  mode: "circle",
  sides: 25,
  rotationDeg: 0,
  pointOffsets: [],
};

export function RingEditor(props: RingEditorProps) {
  const {
    imageSrc,
    imageWidth,
    imageHeight,
    sampleDiameterMm,
    mmPerPxOverride,
    angularCorrectionDeg,
    thicknessOuterGapPx = 0,
    thicknessInnerGapPx = 0,
    onResult,
    onStateChange,
    onGeometryChange,
    onMetricsChange,
    cameraOn = false,
    cameraVideoRef,
    onDeleteImage,
    extraControls,
    saveControl,
    snapshotRef,
    onImageReplace,
    initialGeometry = null,
    aiAnalysisEnabled = false,
    toolbarApiRef,
    onToolbarStateChange,
    hideHeaderToolsInSidebar = false,
    canvasOverlay,
  } = props;
  const style = { ...DEFAULT_STYLE, ...(props.style ?? {}) };

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imgReady, setImgReady] = useState(false);

  const [mode, setMode] = useState<EditMode>("view");
  const [inner, setInner] = useState<Circle | null>(() => initialGeometry?.inner ?? null);
  const [outer, setOuter] = useState<Circle | null>(() => initialGeometry?.outer ?? null);
  const [diam, setDiam] = useState<DiameterBox | null>(() => initialGeometry?.diam ?? null);
  const [diamLine, setDiamLine] = useState<DiameterLine | null>(null);
  const [diamLines, setDiamLines] = useState<DiameterLine[]>(() => initialGeometry?.diamLines ?? []);
  const [selectedDiamLine, setSelectedDiamLine] = useState<number | null>(null);
  const [calibLine, setCalibLine] = useState<DiameterLine | null>(null);
  const [calibLines, setCalibLines] = useState<DiameterLine[]>(() => initialGeometry?.calibLines ?? []);
  const [selectedCalibLine, setSelectedCalibLine] = useState<number | null>(null);
  /** Known length (mm) of the calib line — independent of Sample Diameter. */
  const [calibRefMm, setCalibRefMm] = useState<string>(() =>
    initialGeometry?.calibRefMm != null && initialGeometry.calibRefMm > 0
      ? String(initialGeometry.calibRefMm)
      : "",
  );
  /** User-entered / computed scale — independent of Sample Diameter. */
  const [scaleMmPerPx, setScaleMmPerPx] = useState<string>(() =>
    initialGeometry?.scaleMmPerPx != null && initialGeometry.scaleMmPerPx > 0
      ? String(initialGeometry.scaleMmPerPx)
      : "",
  );
  const [scale, setScale] = useState(() => initialGeometry?.scale ?? 1);
  const [imageFilter, setImageFilter] = useState<ImageFilter>(
    () => initialGeometry?.imageFilter ?? DEFAULT_IMAGE_FILTER,
  );
  const imageFilterUndoRef = useRef<ImageFilter[]>([]);
  const imageFilterRedoRef = useRef<ImageFilter[]>([]);
  const [innerShape, setInnerShape] = useState<InnerShapeConfig>(
    () =>
      initialGeometry?.innerShape
        ? ensurePointOffsets(initialGeometry.innerShape)
        : DEFAULT_INNER_SHAPE,
  );
  const [outerShape, setOuterShape] = useState<InnerShapeConfig>(
    () =>
      initialGeometry?.outerShape
        ? ensurePointOffsets(initialGeometry.outerShape)
        : DEFAULT_INNER_SHAPE,
  );
  const [isInnerAdjustOpen, setIsInnerAdjustOpen] = useState(false);
  const [isOuterAdjustOpen, setIsOuterAdjustOpen] = useState(false);
  const [isDiamAdjustOpen, setIsDiamAdjustOpen] = useState(false);
  const [isMmpxAdjustOpen, setIsMmpxAdjustOpen] = useState(false);
  const [isThicknessAdjustOpen, setIsThicknessAdjustOpen] = useState(false);
  const [isResetAdjustOpen, setIsResetAdjustOpen] = useState(false);
  /** Keep thickness markers visible after leaving the Thickness panel. */
  const [thicknessApplied, setThicknessApplied] = useState(
    () => !!(initialGeometry?.inner && initialGeometry?.outer),
  );
  const [isImageAdjustOpen, setIsImageAdjustOpen] = useState(false);
  const [detectingInner, setDetectingInner] = useState(false);
  const [detectingOuter, setDetectingOuter] = useState(false);
  const [detectingAi, setDetectingAi] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [selectedPolyPoint, setSelectedPolyPoint] = useState<number | null>(null);
  const [selectedOuterPolyPoint, setSelectedOuterPolyPoint] = useState<number | null>(null);
  const [selectedPolyEdges, setSelectedPolyEdges] = useState<number[]>([]);
  const [selectedOuterPolyEdges, setSelectedOuterPolyEdges] = useState<number[]>([]);
  const [selectedThicknessKey, setSelectedThicknessKey] = useState<"none" | "all" | number>("none");
  const [thicknessAngleOffsetsDeg, setThicknessAngleOffsetsDeg] = useState<number[]>(
    () => initialGeometry?.thicknessAngleOffsetsDeg ?? Array.from({ length: 8 }, () => 0),
  );
  const [thicknessDeltaPx, setThicknessDeltaPx] = useState<number[]>(
    () => initialGeometry?.thicknessDeltaPx ?? Array.from({ length: 8 }, () => 0),
  );

  const skipNextImageResetRef = useRef(Boolean(initialGeometry && imageSrc));
  const prevImageSrcRef = useRef<string | null>(imageSrc);

  const dragRef = useRef<{
    handle: DragHandle;
    startX: number;
    startY: number;
    snapshot: { inner: Circle | null; outer: Circle | null; diam: DiameterBox | null };
    snapshotDiamLine: DiameterLine | null;
    snapshotInnerShape: InnerShapeConfig;
    snapshotOuterShape: InnerShapeConfig;
  } | null>(null);
  const drawingDiamRef = useRef(false);
  const drawingCalibRef = useRef(false);

  // Per-test mm/px (calib line) wins; settings override is only a fallback.
  const mmPerPx = useMemo(() => {
    const typed = Number(scaleMmPerPx);
    if (Number.isFinite(typed) && typed > 0) return typed;
    if (mmPerPxOverride && mmPerPxOverride > 0) return mmPerPxOverride;
    return 0;
  }, [mmPerPxOverride, scaleMmPerPx]);

  // When calib line + reference length (mm) exist, derive mm/px automatically.
  useEffect(() => {
    const refMm = Number(calibRefMm);
    if (!Number.isFinite(refMm) || refMm <= 0) return;
    const referenceLine =
      calibLine ??
      (selectedCalibLine !== null
        ? calibLines[selectedCalibLine]
        : calibLines[calibLines.length - 1] ?? null);
    if (!referenceLine) return;
    const lengthPx = Math.hypot(
      referenceLine.x2 - referenceLine.x1,
      referenceLine.y2 - referenceLine.y1,
    );
    if (lengthPx <= 0) return;
    const next = refMm / lengthPx;
    setScaleMmPerPx(String(Number(next.toFixed(6))));
  }, [calibRefMm, calibLine, selectedCalibLine, calibLines]);

  const applyImageFilterChange = (key: keyof ImageFilter, value: number) => {
    setImageFilter((prev) => {
      if (prev[key] === value) return prev;
      imageFilterUndoRef.current.push(prev);
      if (imageFilterUndoRef.current.length > 100) imageFilterUndoRef.current.shift();
      imageFilterRedoRef.current = [];
      return { ...prev, [key]: value };
    });
  };

  const undoImageFilter = () => {
    setImageFilter((prev) => {
      const prevState = imageFilterUndoRef.current.pop();
      if (!prevState) return prev;
      imageFilterRedoRef.current.push(prev);
      return prevState;
    });
  };

  const redoImageFilter = () => {
    setImageFilter((prev) => {
      const nextState = imageFilterRedoRef.current.pop();
      if (!nextState) return prev;
      imageFilterUndoRef.current.push(prev);
      return nextState;
    });
  };

  const resetImageFilter = () => {
    setImageFilter((prev) => {
      const isAlreadyDefault = Object.keys(DEFAULT_IMAGE_FILTER).every((k) => {
        const key = k as keyof ImageFilter;
        return prev[key] === DEFAULT_IMAGE_FILTER[key];
      });
      if (isAlreadyDefault) return prev;
      imageFilterUndoRef.current.push(prev);
      if (imageFilterUndoRef.current.length > 100) imageFilterUndoRef.current.shift();
      imageFilterRedoRef.current = [];
      return { ...DEFAULT_IMAGE_FILTER };
    });
  };

  const replaceImageFromCanvas = (
    width: number,
    height: number,
    draw: (ctx: CanvasRenderingContext2D, source: HTMLImageElement) => void,
  ) => {
    if (!onImageReplace || !imageRef.current) return;
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(width));
    out.height = Math.max(1, Math.round(height));
    const ctx = out.getContext("2d");
    if (!ctx) return;
    draw(ctx, imageRef.current);
    onImageReplace(out.toDataURL("image/png"), { w: out.width, h: out.height });
  };

  const rotateImage = (dir: "left" | "right") => {
    const src = imageRef.current;
    if (!src) return;
    replaceImageFromCanvas(src.height, src.width, (ctx, s) => {
      if (dir === "right") {
        ctx.translate(s.height, 0);
        ctx.rotate(Math.PI / 2);
      } else {
        ctx.translate(0, s.width);
        ctx.rotate(-Math.PI / 2);
      }
      ctx.drawImage(s, 0, 0);
    });
  };

  const flipImage = (axis: "h" | "v") => {
    const src = imageRef.current;
    if (!src) return;
    replaceImageFromCanvas(src.width, src.height, (ctx, s) => {
      if (axis === "h") {
        ctx.translate(s.width, 0);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(0, s.height);
        ctx.scale(1, -1);
      }
      ctx.drawImage(s, 0, 0);
    });
  };

  const cropCenter = () => {
    const src = imageRef.current;
    if (!src) return;
    const side = Math.floor(Math.min(src.width, src.height) * 0.9);
    const sx = Math.floor((src.width - side) / 2);
    const sy = Math.floor((src.height - side) / 2);
    replaceImageFromCanvas(side, side, (ctx, s) => {
      ctx.drawImage(s, sx, sy, side, side, 0, 0, side, side);
    });
  };

  /**
   * Auto image quality — analyse the current image histogram (auto-levels) and
   * derive Brightness / Contrast / Color slider values so faint scans become
   * clear without manual tuning. Applies to the non-destructive filter state.
   */
  const autoEnhanceImage = () => {
    const src = imageRef.current;
    if (!src) return;
    const sampleMax = 480;
    const sScale = Math.min(1, sampleMax / Math.max(src.width, src.height));
    const sw = Math.max(16, Math.round(src.width * sScale));
    const sh = Math.max(16, Math.round(src.height * sScale));
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(src, 0, 0, sw, sh);
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(0, 0, sw, sh).data;
    } catch {
      return;
    }

    const hist = new Array<number>(256).fill(0);
    let total = 0;
    let satSum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      hist[lum]! += 1;
      total += 1;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      satSum += mx > 0 ? (mx - mn) / mx : 0;
    }
    if (total < 1) return;

    // Percentile-based black/white points ignore the brightest/darkest 1.5%.
    const lowCut = total * 0.015;
    const highCut = total * 0.015;
    let acc = 0;
    let pLow = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v]!;
      if (acc >= lowCut) {
        pLow = v;
        break;
      }
    }
    acc = 0;
    let pHigh = 255;
    for (let v = 255; v >= 0; v--) {
      acc += hist[v]!;
      if (acc >= highCut) {
        pHigh = v;
        break;
      }
    }
    const spread = Math.max(1, pHigh - pLow);

    let meanSum = 0;
    for (let v = 0; v < 256; v++) meanSum += v * hist[v]!;
    const mean = meanSum / total;

    // CSS contrast(c): v' = (v-128)*c + 128 → stretch spread to ~225.
    const contrastFactor = 225 / spread;
    const contrastPct = Math.round(clampNum(contrastFactor * 100, 60, 150));

    const meanAfterContrast = (mean - 128) * (contrastPct / 100) + 128;
    const brightnessFactor = 138 / Math.max(1, meanAfterContrast);
    const brightnessPct = Math.round(clampNum(brightnessFactor * 100, 60, 150));

    // Mild saturation lift only for dull images.
    const avgSat = satSum / total;
    const saturationPct = Math.round(clampNum(avgSat < 0.12 ? 120 : 105, 100, 150));

    setImageFilter((prev) => {
      imageFilterUndoRef.current.push(prev);
      if (imageFilterUndoRef.current.length > 100) imageFilterUndoRef.current.shift();
      imageFilterRedoRef.current = [];
      return {
        ...prev,
        brightness: brightnessPct,
        contrast: contrastPct,
        saturation: saturationPct,
        sepia: 0,
        invert: 0,
      };
    });
  };

  /**
   * Pixel update — bake current filters into the bitmap, upscale small images,
   * and apply an unsharp-mask sharpen so edges get crisper pixels. Destructive:
   * replaces the working image (Reset via re-upload / undo of geometry).
   */
  const enhancePixels = () => {
    const src = imageRef.current;
    if (!onImageReplace || !src) return;
    const longest = Math.max(src.width, src.height);
    const upscale = longest < 1000 ? 1.6 : 1;
    const w = Math.max(1, Math.round(src.width * upscale));
    const h = Math.max(1, Math.round(src.height * upscale));

    const base = document.createElement("canvas");
    base.width = w;
    base.height = h;
    const bctx = base.getContext("2d", { willReadFrequently: true });
    if (!bctx) return;
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = "high";
    bctx.filter = `brightness(${imageFilter.brightness}%) contrast(${imageFilter.contrast}%) saturate(${imageFilter.saturation}%) grayscale(${imageFilter.grayscale}%) sepia(${imageFilter.sepia}%) invert(${imageFilter.invert}%)`;
    bctx.drawImage(src, 0, 0, w, h);
    bctx.filter = "none";

    let imgData: ImageData;
    try {
      imgData = bctx.getImageData(0, 0, w, h);
    } catch {
      return;
    }
    const sharpened = unsharpMask(imgData, w, h, 0.6);
    bctx.putImageData(sharpened, 0, 0);

    onImageReplace(base.toDataURL("image/png"), { w, h });
    // Filters are now baked into pixels → reset sliders to neutral.
    setImageFilter({ ...DEFAULT_IMAGE_FILTER });
    imageFilterUndoRef.current = [];
    imageFilterRedoRef.current = [];
  };

  // Load image
  useEffect(() => {
    if (!imageSrc) {
      imageRef.current = null;
      setImgReady(false);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setImgReady(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // When image changes, clear guides — but skip once when restoring a saved draft.
  useEffect(() => {
    if (skipNextImageResetRef.current) {
      skipNextImageResetRef.current = false;
      prevImageSrcRef.current = imageSrc;
      return;
    }
    if (prevImageSrcRef.current === imageSrc) return;
    prevImageSrcRef.current = imageSrc;

    setInner(null);
    setOuter(null);
    setDiam(null);
    setDiamLine(null);
    setDiamLines([]);
    setSelectedDiamLine(null);
    setCalibLine(null);
    setCalibLines([]);
    setSelectedCalibLine(null);
    setCalibRefMm("");
    setScaleMmPerPx("");
    setIsInnerAdjustOpen(false);
    setIsOuterAdjustOpen(false);
    setIsDiamAdjustOpen(false);
    setIsMmpxAdjustOpen(false);
    setIsThicknessAdjustOpen(false);
    setIsImageAdjustOpen(false);
    setIsResetAdjustOpen(false);
    setSelectedPolyPoint(null);
    setSelectedOuterPolyPoint(null);
    setSelectedPolyEdges([]);
    setSelectedOuterPolyEdges([]);
    setSelectedThicknessKey("none");
    setThicknessAngleOffsetsDeg(Array.from({ length: 8 }, () => 0));
    setThicknessDeltaPx(Array.from({ length: 8 }, () => 0));
    setThicknessApplied(false);
    setInnerShape(DEFAULT_INNER_SHAPE);
    setOuterShape(DEFAULT_INNER_SHAPE);
    setImageFilter(DEFAULT_IMAGE_FILTER);
    // Scale is set by fit-to-window after the image dimensions are ready.
    imageFilterUndoRef.current = [];
    imageFilterRedoRef.current = [];
  }, [imageSrc]);

  useEffect(() => {
    setInnerShape((prev) => ensurePointOffsets(prev));
  }, [innerShape.sides]);
  useEffect(() => {
    setOuterShape((prev) => ensurePointOffsets(prev));
  }, [outerShape.sides]);

  useEffect(() => {
    if (innerShape.mode !== "polygon") {
      setSelectedPolyPoint(null);
      return;
    }
    if (selectedPolyPoint !== null && selectedPolyPoint >= Math.max(3, Math.round(innerShape.sides))) {
      setSelectedPolyPoint(null);
    }
  }, [innerShape.mode, innerShape.sides, selectedPolyPoint]);
  useEffect(() => {
    if (outerShape.mode !== "polygon") {
      setSelectedOuterPolyPoint(null);
      return;
    }
    if (
      selectedOuterPolyPoint !== null &&
      selectedOuterPolyPoint >= Math.max(3, Math.round(outerShape.sides))
    ) {
      setSelectedOuterPolyPoint(null);
    }
  }, [outerShape.mode, outerShape.sides, selectedOuterPolyPoint]);

  // Notify parent of state changes
  useEffect(() => {
    onStateChange?.({ inner, outer, diam });
  }, [inner, outer, diam, onStateChange]);

  useEffect(() => {
    onGeometryChange?.({
      inner,
      outer,
      diam,
      diamLines,
      calibLines,
      calibRefMm: (() => {
        const n = Number(calibRefMm);
        return Number.isFinite(n) && n > 0 ? n : null;
      })(),
      scaleMmPerPx: (() => {
        const n = Number(scaleMmPerPx);
        return Number.isFinite(n) && n > 0 ? n : null;
      })(),
      innerShape,
      outerShape,
      thicknessAngleOffsetsDeg,
      thicknessDeltaPx,
      imageFilter,
      scale,
    });
  }, [
    inner,
    outer,
    diam,
    diamLines,
    calibLines,
    calibRefMm,
    scaleMmPerPx,
    innerShape,
    outerShape,
    thicknessAngleOffsetsDeg,
    thicknessDeltaPx,
    imageFilter,
    scale,
    onGeometryChange,
  ]);

  useEffect(() => {
    if (!snapshotRef) return;
    snapshotRef.current = () => canvasRef.current?.toDataURL("image/png") ?? null;
    return () => {
      snapshotRef.current = null;
    };
  }, [snapshotRef]);

  // Run analysis whenever circles or calibration change
  const result = useMemo<RingResult | null>(() => {
    if (!inner || !outer || !sampleDiameterMm || !mmPerPx) return null;
    return analyseRing({
      inner,
      outer,
      sampleDiameterMm,
      mmPerPx,
      angularOffsetDeg: angularCorrectionDeg,
    });
  }, [inner, outer, sampleDiameterMm, mmPerPx, angularCorrectionDeg]);

  const thicknessPairsDisplay = useMemo(() => {
    if (!inner || !outer) return [];
    const mmForPairs = mmPerPx > 0 ? mmPerPx : 1;
    return computeAdjustedThicknessPairs({
      inner,
      outer,
      innerShape,
      outerShape,
      mmPerPx: mmForPairs,
      angularOffsetDeg: angularCorrectionDeg,
      angleOffsetsDeg: thicknessAngleOffsetsDeg,
      thicknessDeltaPx,
      outerGapPx: thicknessOuterGapPx,
      innerGapPx: thicknessInnerGapPx,
    });
  }, [inner, outer, innerShape, outerShape, mmPerPx, angularCorrectionDeg, thicknessAngleOffsetsDeg, thicknessDeltaPx, thicknessOuterGapPx, thicknessInnerGapPx]);

  const effectiveResult = useMemo<RingResult | null>(() => {
    if (!result) return null;
    if (thicknessPairsDisplay.length !== 8) return result;
    const diameterMmFromLines =
      diamLines.length > 0 && mmPerPx > 0
        ? (diamLines.reduce((sum, l) => sum + Math.hypot(l.x2 - l.x1, l.y2 - l.y1), 0) / diamLines.length) *
          mmPerPx
        : null;
    const lowLimit = diameterMmFromLines !== null ? diameterMmFromLines * 0.07 : result.thicknessLow;
    const highLimit = diameterMmFromLines !== null ? diameterMmFromLines * 0.15 : result.thicknessHigh;
    const valid = thicknessPairsDisplay
      .map((p) => p.thickness_mm)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    const thicknessMin = valid.length ? Math.min(...valid) : null;
    const thicknessMax = valid.length ? Math.max(...valid) : null;
    const thicknessMean = valid.length ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
    const thicknessInRange = valid.length === 8 && valid.every((v) => v >= lowLimit && v <= highLimit);
    return {
      ...result,
      thicknessPairs: thicknessPairsDisplay,
      thicknessMin,
      thicknessMax,
      thicknessMean,
      thicknessLow: lowLimit,
      thicknessHigh: highLimit,
      thicknessInRange,
      overallPass: thicknessInRange && result.tmShareInRange,
    };
  }, [result, thicknessPairsDisplay, diamLines, mmPerPx]);

  useEffect(() => {
    onResult?.(effectiveResult);
  }, [effectiveResult, onResult]);

  useEffect(() => {
    const fpAreaPx2 = inner ? Math.PI * inner.r * inner.r : null;
    const tmAreaPx2 =
      inner && outer ? Math.max(0, Math.PI * (outer.r * outer.r - inner.r * inner.r)) : null;
    const totalAreaPx2 =
      fpAreaPx2 !== null && tmAreaPx2 !== null ? fpAreaPx2 + tmAreaPx2 : fpAreaPx2;
    const tmAreaPercent =
      tmAreaPx2 !== null && totalAreaPx2 && totalAreaPx2 > 0 ? (tmAreaPx2 / totalAreaPx2) * 100 : null;
    const lengthsPx = diamLines.map((l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1));
    const diameterLineCount = lengthsPx.length;
    const diameterSinglePx = diameterLineCount === 1 ? lengthsPx[0] : null;
    const diameterAveragePx =
      diameterLineCount > 1 ? lengthsPx.reduce((s, v) => s + v, 0) / diameterLineCount : diameterSinglePx;
    const diameterSingleMm = diameterSinglePx !== null && mmPerPx > 0 ? diameterSinglePx * mmPerPx : null;
    const diameterAverageMm = diameterAveragePx !== null && mmPerPx > 0 ? diameterAveragePx * mmPerPx : null;
    onMetricsChange?.({
      mmPerPx,
      thicknessMean: effectiveResult?.thicknessMean ?? null,
      thicknessPoints: effectiveResult?.thicknessPairs.length ?? 0,
      fpAreaPx2,
      tmAreaPx2,
      totalAreaPx2,
      tmAreaPercent,
      diameterLineCount,
      diameterSinglePx,
      diameterAveragePx,
      diameterSingleMm,
      diameterAverageMm,
      thicknessEnabled: thicknessApplied && !!inner && !!outer,
    });
  }, [mmPerPx, effectiveResult, onMetricsChange, inner, outer, diamLines, thicknessApplied]);

  // Fit canvas to the visible window/container (default on upload + resize).
  const updateScale = useCallback(() => {
    const el = containerRef.current;
    if (!el || !imageWidth || !imageHeight) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (cw < 8 || ch < 8) return;
    const pad = 8;
    const maxW = Math.max(cw - pad, 1);
    const maxH = Math.max(ch - pad, 1);
    const s = Math.min(maxW / imageWidth, maxH / imageHeight);
    setScale(Math.min(5, Math.max(0.05, s)));
  }, [imageWidth, imageHeight]);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(0.05, prev * 0.9));
  }, []);

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(5, prev * 1.1));
  }, []);

  const fitToWindow = useCallback(() => {
    // Wait for layout after upload / modal open
    requestAnimationFrame(() => {
      updateScale();
      requestAnimationFrame(updateScale);
    });
  }, [updateScale]);

  useEffect(() => {
    updateScale();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateScale);
      return () => window.removeEventListener("resize", updateScale);
    }
    const ro = new ResizeObserver(() => updateScale());
    ro.observe(el);
    window.addEventListener("resize", updateScale);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [updateScale]);

  // New / replaced image → always fit to window by default
  useEffect(() => {
    if (!imageSrc || !imgReady || !imageWidth || !imageHeight) return;
    fitToWindow();
  }, [imageSrc, imgReady, imageWidth, imageHeight, fitToWindow]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = imageWidth * scale;
    const H = imageHeight * scale;
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    ctx.clearRect(0, 0, W, H);

    // Draw image
    if (imageRef.current && imgReady) {
      ctx.save();
      ctx.filter = `brightness(${imageFilter.brightness}%) contrast(${imageFilter.contrast}%) saturate(${imageFilter.saturation}%) grayscale(${imageFilter.grayscale}%) sepia(${imageFilter.sepia}%) invert(${imageFilter.invert}%)`;
      ctx.drawImage(imageRef.current, 0, 0, W, H);
      ctx.restore();
    } else {
      ctx.fillStyle = "#0a1322";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#475569";
      ctx.font = "14px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No image loaded — upload or capture", W / 2, H / 2);
    }
    drawGridAndRulers(ctx, W, H, scale);

    // Outer ring
    if (outer) {
      ctx.lineWidth = style.outer.width;
      ctx.strokeStyle = style.outer.color;
      drawInnerShape(
        ctx,
        outer,
        scale,
        outerShape,
        style.outer.color,
        style.outer.width,
        mode === "outer" ? selectedOuterPolyPoint : null,
        mode === "outer" ? selectedOuterPolyEdges : [],
      );
      drawCenter(ctx, outer.cx * scale, outer.cy * scale, style.outer.color);
      if (mode === "outer") drawResizeHandles(ctx, outer, scale, style.outer.color);
    }

    // Inner ring
    if (inner) {
      ctx.lineWidth = style.inner.width;
      ctx.strokeStyle = style.inner.color;
      drawInnerShape(
        ctx,
        inner,
        scale,
        innerShape,
        style.inner.color,
        style.inner.width,
        mode === "inner" ? selectedPolyPoint : null,
        mode === "inner" ? selectedPolyEdges : [],
      );
      drawCenter(ctx, inner.cx * scale, inner.cy * scale, style.inner.color);
      if (mode === "inner") drawResizeHandles(ctx, inner, scale, style.inner.color);
    }

    // Diameter measurement lines with live px/mm
    const linesToDraw = diamLine ? [...diamLines, diamLine] : diamLines;
    linesToDraw.forEach((line, idx) => {
      const x1 = line.x1 * scale;
      const y1 = line.y1 * scale;
      const x2 = line.x2 * scale;
      const y2 = line.y2 * scale;
      const lenPx = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
      const mmText = mmPerPx > 0 ? ` · ${(lenPx * mmPerPx).toFixed(3)} mm` : "";
      const text = `${lenPx.toFixed(1)} px${mmText}`;
      const selected = idx === selectedDiamLine || (diamLine && idx === linesToDraw.length - 1);
      const lineColor = selected ? "#facc15" : style.diam.color;

      ctx.lineWidth = style.diam.width;
      ctx.strokeStyle = lineColor;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      drawHandle(ctx, x1, y1, lineColor);
      drawHandle(ctx, x2, y2, lineColor);

      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      ctx.font = "bold 12px Inter, sans-serif";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.fillStyle = "#ffffff";
      ctx.strokeText(text, mx + 8, my - 8);
      ctx.fillText(text, mx + 8, my - 8);
    });

    // Calibration lines for mm/px (known sample diameter)
    const calibToDraw = calibLine ? [...calibLines, calibLine] : calibLines;
    calibToDraw.forEach((line, idx) => {
      const x1 = line.x1 * scale;
      const y1 = line.y1 * scale;
      const x2 = line.x2 * scale;
      const y2 = line.y2 * scale;
      const lenPx = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
      const refMm = Number(calibRefMm);
      const scaleText =
        Number.isFinite(refMm) && refMm > 0 && lenPx > 0
          ? ` · ${(refMm / lenPx).toFixed(4)} mm/px`
          : mmPerPx > 0
            ? ` · ${mmPerPx.toFixed(4)} mm/px`
            : "";
      const text = `${lenPx.toFixed(1)} px${scaleText}`;
      const selected = idx === selectedCalibLine || (calibLine && idx === calibToDraw.length - 1);
      const lineColor = selected ? "#a5f3fc" : MMPX_LINE_COLOR;

      ctx.lineWidth = 2;
      ctx.strokeStyle = lineColor;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      drawHandle(ctx, x1, y1, lineColor);
      drawHandle(ctx, x2, y2, lineColor);

      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      ctx.font = "bold 12px Inter, sans-serif";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.fillStyle = "#ffffff";
      ctx.strokeText(text, mx + 8, my - 8);
      ctx.fillText(text, mx + 8, my - 8);
    });

    // Thickness markers + labels
    if (thicknessPairsDisplay.length > 0 && thicknessApplied) {
      ctx.lineWidth = style.thick.width;
      ctx.strokeStyle = style.thick.color;
      ctx.fillStyle = style.thick.color;
      thicknessPairsDisplay.forEach((p) => {
        const ix = p.inner_xy[0] * scale;
        const iy = p.inner_xy[1] * scale;
        const ox = p.outer_xy[0] * scale;
        const oy = p.outer_xy[1] * scale;
        ctx.beginPath();
        ctx.moveTo(ix, iy);
        ctx.lineTo(ox, oy);
        ctx.stroke();
        const r = Math.max(3, style.thick.width + 2);
        ctx.beginPath();
        ctx.arc(ix, iy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();
        // Label
        const mx = (ix + ox) / 2;
        const my = (iy + oy) / 2;
        ctx.font = "12px Inter, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.lineWidth = 3;
        const txt = p.thickness_mm !== null ? `${p.label}  ${p.thickness_mm.toFixed(3)} mm` : p.label;
        // Offset label outward from centre
        const cx = outer ? outer.cx * scale : W / 2;
        const cy = outer ? outer.cy * scale : H / 2;
        const dx = mx - cx;
        const dy = my - cy;
        const norm = Math.max(1, Math.hypot(dx, dy));
        const lx = mx + (dx / norm) * 18;
        const ly = my + (dy / norm) * 18;
        ctx.strokeText(txt, lx + 4, ly);
        ctx.fillText(txt, lx + 4, ly);
        ctx.fillStyle = style.thick.color;
        ctx.strokeStyle = style.thick.color;
        ctx.lineWidth = style.thick.width;
      });
    }
  }, [imgReady, imageWidth, imageHeight, scale, inner, innerShape, outer, outerShape, diam, diamLine, diamLines, selectedDiamLine, calibLine, calibLines, selectedCalibLine, calibRefMm, mode, result, style, selectedPolyPoint, selectedOuterPolyPoint, selectedPolyEdges, selectedOuterPolyEdges, mmPerPx, thicknessPairsDisplay, thicknessApplied, imageFilter]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      canvasRef.current.setPointerCapture(e.pointerId);
      const { x, y } = pointerImageCoords(e, canvasRef.current, scale);
      if (mode === "mmpx") {
        const lineHitIndex = findDiameterLineHandleOrSegment(x, y, calibLines);
        if (lineHitIndex !== null) {
          const hitLine = calibLines[lineHitIndex];
          setSelectedCalibLine(lineHitIndex);
          if (insideHandle(x, y, hitLine.x1, hitLine.y1)) {
            dragRef.current = {
              handle: { kind: "calib-point", point: "start", lineIndex: lineHitIndex },
              startX: x,
              startY: y,
              snapshot: { inner: inner ? { ...inner } : null, outer: outer ? { ...outer } : null, diam: diam ? { ...diam } : null },
              snapshotDiamLine: { ...hitLine },
              snapshotInnerShape: ensurePointOffsets({
                ...innerShape,
                pointOffsets: innerShape.pointOffsets.map((p) => ({ ...p })),
              }),
              snapshotOuterShape: ensurePointOffsets({
                ...outerShape,
                pointOffsets: outerShape.pointOffsets.map((p) => ({ ...p })),
              }),
            };
            canvasRef.current.focus();
            return;
          }
          if (insideHandle(x, y, hitLine.x2, hitLine.y2)) {
            dragRef.current = {
              handle: { kind: "calib-point", point: "end", lineIndex: lineHitIndex },
              startX: x,
              startY: y,
              snapshot: { inner: inner ? { ...inner } : null, outer: outer ? { ...outer } : null, diam: diam ? { ...diam } : null },
              snapshotDiamLine: { ...hitLine },
              snapshotInnerShape: ensurePointOffsets({
                ...innerShape,
                pointOffsets: innerShape.pointOffsets.map((p) => ({ ...p })),
              }),
              snapshotOuterShape: ensurePointOffsets({
                ...outerShape,
                pointOffsets: outerShape.pointOffsets.map((p) => ({ ...p })),
              }),
            };
            canvasRef.current.focus();
            return;
          }
          return;
        }
        drawingCalibRef.current = true;
        setCalibLine({ x1: x, y1: y, x2: x, y2: y });
        canvasRef.current.focus();
        return;
      }
      if (mode === "diam") {
        const lineHitIndex = findDiameterLineHandleOrSegment(x, y, diamLines);
        if (lineHitIndex !== null) {
          const hitLine = diamLines[lineHitIndex];
          setSelectedDiamLine(lineHitIndex);
          if (insideHandle(x, y, hitLine.x1, hitLine.y1)) {
            dragRef.current = {
              handle: { kind: "diam-point", point: "start", lineIndex: lineHitIndex },
              startX: x,
              startY: y,
              snapshot: { inner: inner ? { ...inner } : null, outer: outer ? { ...outer } : null, diam: diam ? { ...diam } : null },
              snapshotDiamLine: { ...hitLine },
              snapshotInnerShape: ensurePointOffsets({
                ...innerShape,
                pointOffsets: innerShape.pointOffsets.map((p) => ({ ...p })),
              }),
              snapshotOuterShape: ensurePointOffsets({
                ...outerShape,
                pointOffsets: outerShape.pointOffsets.map((p) => ({ ...p })),
              }),
            };
            canvasRef.current.focus();
            return;
          }
          if (insideHandle(x, y, hitLine.x2, hitLine.y2)) {
            dragRef.current = {
              handle: { kind: "diam-point", point: "end", lineIndex: lineHitIndex },
              startX: x,
              startY: y,
              snapshot: { inner: inner ? { ...inner } : null, outer: outer ? { ...outer } : null, diam: diam ? { ...diam } : null },
              snapshotDiamLine: { ...hitLine },
              snapshotInnerShape: ensurePointOffsets({
                ...innerShape,
                pointOffsets: innerShape.pointOffsets.map((p) => ({ ...p })),
              }),
              snapshotOuterShape: ensurePointOffsets({
                ...outerShape,
                pointOffsets: outerShape.pointOffsets.map((p) => ({ ...p })),
              }),
            };
            canvasRef.current.focus();
            return;
          }
          return;
        }
        drawingDiamRef.current = true;
        setDiamLine({ x1: x, y1: y, x2: x, y2: y });
        setDiam({ x, y, w: 0, h: 0 });
        canvasRef.current.focus();
        return;
      }

      let handle: DragHandle = null;
      if (mode === "inner" && inner) {
        if (innerShape.mode === "polygon") {
          const poly = getPolygonPoints(inner, innerShape);
          const idx = poly.findIndex((pt) => insidePolyVertexHandle(x, y, pt.x, pt.y));
          if (idx >= 0) {
            setSelectedPolyPoint(idx);
            setSelectedPolyEdges([]);
            handle = { kind: "poly-point", index: idx };
          } else {
            const edgeIndex = findPolygonEdgeNearPoint(x, y, poly, 10);
            if (edgeIndex >= 0) {
              if (e.ctrlKey || e.metaKey) {
                setSelectedPolyEdges((prev) =>
                  prev.includes(edgeIndex) ? prev.filter((v) => v !== edgeIndex) : [...prev, edgeIndex],
                );
                return;
              }
              setSelectedPolyPoint(null);
              const indices =
                selectedPolyEdges.includes(edgeIndex) && selectedPolyEdges.length > 1
                  ? selectedPolyEdges
                  : [edgeIndex];
              setSelectedPolyEdges(indices);
              handle = { kind: "poly-edge", ring: "inner", indices };
            }
          }
        }
        if (!handle && insideHandle(x, y, inner.cx + inner.r, inner.cy)) handle = { kind: "resize", ring: "inner" };
        else if (innerShape.mode !== "polygon" && insideRingNear(x, y, inner)) handle = { kind: "move", ring: "inner" };
      } else if (mode === "outer" && outer) {
        if (outerShape.mode === "polygon") {
          const poly = getPolygonPoints(outer, outerShape);
          const idx = poly.findIndex((pt) => insidePolyVertexHandle(x, y, pt.x, pt.y));
          if (idx >= 0) {
            setSelectedOuterPolyPoint(idx);
            setSelectedOuterPolyEdges([]);
            handle = { kind: "poly-point", index: idx };
          } else {
            const edgeIndex = findPolygonEdgeNearPoint(x, y, poly, 10);
            if (edgeIndex >= 0) {
              if (e.ctrlKey || e.metaKey) {
                setSelectedOuterPolyEdges((prev) =>
                  prev.includes(edgeIndex) ? prev.filter((v) => v !== edgeIndex) : [...prev, edgeIndex],
                );
                return;
              }
              setSelectedOuterPolyPoint(null);
              const indices =
                selectedOuterPolyEdges.includes(edgeIndex) && selectedOuterPolyEdges.length > 1
                  ? selectedOuterPolyEdges
                  : [edgeIndex];
              setSelectedOuterPolyEdges(indices);
              handle = { kind: "poly-edge", ring: "outer", indices };
            }
          }
        }
        if (!handle && insideHandle(x, y, outer.cx + outer.r, outer.cy)) handle = { kind: "resize", ring: "outer" };
        else if (outerShape.mode !== "polygon" && insideRingNear(x, y, outer)) handle = { kind: "move", ring: "outer" };
      }
      if (!handle) return;
      canvasRef.current.focus();
      dragRef.current = {
        handle,
        startX: x,
        startY: y,
        snapshot: { inner: inner ? { ...inner } : null, outer: outer ? { ...outer } : null, diam: diam ? { ...diam } : null },
        snapshotDiamLine: diamLine ? { ...diamLine } : null,
        snapshotInnerShape: ensurePointOffsets({
          ...innerShape,
          pointOffsets: innerShape.pointOffsets.map((p) => ({ ...p })),
        }),
        snapshotOuterShape: ensurePointOffsets({
          ...outerShape,
          pointOffsets: outerShape.pointOffsets.map((p) => ({ ...p })),
        }),
      };
    },
    [mode, inner, outer, diam, diamLine, diamLines, calibLines, scale, innerShape, outerShape, selectedPolyEdges, selectedOuterPolyEdges],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      const { x, y } = pointerImageCoords(e, canvasRef.current, scale);
      if (mode === "mmpx" && drawingCalibRef.current) {
        setCalibLine((prev) => (prev ? { ...prev, x2: x, y2: y } : prev));
        return;
      }
      if (mode === "diam" && drawingDiamRef.current) {
        setDiamLine((prev) => {
          if (!prev) return prev;
          const next = { ...prev, x2: x, y2: y };
          const len = Math.hypot(next.x2 - next.x1, next.y2 - next.y1);
          const minX = Math.min(next.x1, next.x2);
          const minY = Math.min(next.y1, next.y2);
          setDiam({ x: minX, y: minY, w: len, h: len });
          return next;
        });
        return;
      }
      if (!dragRef.current) return;
      const d = dragRef.current;
      const dx = x - d.startX;
      const dy = y - d.startY;
      if (d.handle?.kind === "calib-point" && d.snapshotDiamLine) {
        const lineIndex = d.handle.lineIndex;
        const next =
          d.handle.point === "start"
            ? { ...d.snapshotDiamLine, x1: x, y1: y }
            : { ...d.snapshotDiamLine, x2: x, y2: y };
        setCalibLines((prev) => prev.map((line, idx) => (idx === lineIndex ? next : line)));
        return;
      }
      if (d.handle?.kind === "diam-point" && d.snapshotDiamLine) {
        const lineIndex = d.handle.lineIndex;
        const next =
          d.handle.point === "start"
            ? { ...d.snapshotDiamLine, x1: x, y1: y }
            : { ...d.snapshotDiamLine, x2: x, y2: y };
        setDiamLines((prev) => prev.map((line, idx) => (idx === lineIndex ? next : line)));
        const len = Math.hypot(next.x2 - next.x1, next.y2 - next.y1);
        const minX = Math.min(next.x1, next.x2);
        const minY = Math.min(next.y1, next.y2);
        setDiam({ x: minX, y: minY, w: len, h: len });
        return;
      }
      if (d.handle?.kind === "move" && d.handle.ring === "inner" && d.snapshot.inner) {
        setInner({ ...d.snapshot.inner, cx: d.snapshot.inner.cx + dx, cy: d.snapshot.inner.cy + dy });
      } else if (d.handle?.kind === "move" && d.handle.ring === "outer" && d.snapshot.outer) {
        setOuter({ ...d.snapshot.outer, cx: d.snapshot.outer.cx + dx, cy: d.snapshot.outer.cy + dy });
      } else if (d.handle?.kind === "move" && d.handle.ring === "diam" && d.snapshot.diam) {
        setDiam({ ...d.snapshot.diam, x: d.snapshot.diam.x + dx, y: d.snapshot.diam.y + dy });
      } else if (d.handle?.kind === "resize" && d.handle.ring === "inner" && d.snapshot.inner) {
        const r = Math.max(4, Math.hypot(x - d.snapshot.inner.cx, y - d.snapshot.inner.cy));
        setInner({ ...d.snapshot.inner, r });
      } else if (d.handle?.kind === "resize" && d.handle.ring === "outer" && d.snapshot.outer) {
        const r = Math.max(4, Math.hypot(x - d.snapshot.outer.cx, y - d.snapshot.outer.cy));
        setOuter({ ...d.snapshot.outer, r });
      } else if (d.handle?.kind === "poly-point" && d.snapshot.inner && mode === "inner") {
        const idx = d.handle.index;
        const basePoints = getPolygonPoints(d.snapshot.inner, {
          ...d.snapshotInnerShape,
          pointOffsets: ensurePointOffsets(d.snapshotInnerShape).pointOffsets.map((p) => ({ ...p })),
        });
        const base = basePoints[idx];
        if (!base) return;
        setInnerShape((prev) => {
          const next = ensurePointOffsets({
            ...d.snapshotInnerShape,
            pointOffsets: d.snapshotInnerShape.pointOffsets.map((p) => ({ ...p })),
          });
          if (!next.pointOffsets[idx]) return next;
          const offsets = next.pointOffsets.map((p) => ({ ...p }));
          offsets[idx] = { dx: x - base.x, dy: y - base.y };
          return { ...next, pointOffsets: offsets };
        });
      } else if (d.handle?.kind === "poly-point" && d.snapshot.outer && mode === "outer") {
        const idx = d.handle.index;
        const basePoints = getPolygonPoints(d.snapshot.outer, {
          ...d.snapshotOuterShape,
          pointOffsets: ensurePointOffsets(d.snapshotOuterShape).pointOffsets.map((p) => ({ ...p })),
        });
        const base = basePoints[idx];
        if (!base) return;
        setOuterShape((prev) => {
          const next = ensurePointOffsets({
            ...d.snapshotOuterShape,
            pointOffsets: d.snapshotOuterShape.pointOffsets.map((p) => ({ ...p })),
          });
          if (!next.pointOffsets[idx]) return next;
          const offsets = next.pointOffsets.map((p) => ({ ...p }));
          offsets[idx] = { dx: x - base.x, dy: y - base.y };
          return { ...next, pointOffsets: offsets };
        });
      } else if (d.handle?.kind === "poly-edge" && d.handle.ring === "inner" && d.snapshot.inner && mode === "inner") {
        const vertices = edgeSelectionToVertexIndexes(
          d.handle.indices,
          Math.max(3, Math.round(d.snapshotInnerShape.sides)),
        );
        setInnerShape(() => {
          const next = ensurePointOffsets({
            ...d.snapshotInnerShape,
            pointOffsets: d.snapshotInnerShape.pointOffsets.map((p) => ({ ...p })),
          });
          if (vertices.length === 0) return next;
          const offsets = next.pointOffsets.map((p) => ({ ...p }));
          vertices.forEach((vertexIdx) => {
            if (!offsets[vertexIdx]) return;
            offsets[vertexIdx] = {
              dx: offsets[vertexIdx].dx + dx,
              dy: offsets[vertexIdx].dy + dy,
            };
          });
          return { ...next, pointOffsets: offsets };
        });
      } else if (d.handle?.kind === "poly-edge" && d.handle.ring === "outer" && d.snapshot.outer && mode === "outer") {
        const vertices = edgeSelectionToVertexIndexes(
          d.handle.indices,
          Math.max(3, Math.round(d.snapshotOuterShape.sides)),
        );
        setOuterShape(() => {
          const next = ensurePointOffsets({
            ...d.snapshotOuterShape,
            pointOffsets: d.snapshotOuterShape.pointOffsets.map((p) => ({ ...p })),
          });
          if (vertices.length === 0) return next;
          const offsets = next.pointOffsets.map((p) => ({ ...p }));
          vertices.forEach((vertexIdx) => {
            if (!offsets[vertexIdx]) return;
            offsets[vertexIdx] = {
              dx: offsets[vertexIdx].dx + dx,
              dy: offsets[vertexIdx].dy + dy,
            };
          });
          return { ...next, pointOffsets: offsets };
        });
      } else if (d.handle?.kind === "diam-handle" && d.snapshot.diam) {
        const s = d.snapshot.diam;
        let nx = s.x;
        let ny = s.y;
        let nw = s.w;
        let nh = s.h;
        if (d.handle.corner === "tl") {
          nx = s.x + dx;
          ny = s.y + dy;
          nw = s.w - dx;
          nh = s.h - dy;
        } else if (d.handle.corner === "tr") {
          ny = s.y + dy;
          nw = s.w + dx;
          nh = s.h - dy;
        } else if (d.handle.corner === "bl") {
          nx = s.x + dx;
          nw = s.w - dx;
          nh = s.h + dy;
        } else {
          nw = s.w + dx;
          nh = s.h + dy;
        }
        if (nw < 8) nw = 8;
        if (nh < 8) nh = 8;
        setDiam({ x: nx, y: ny, w: nw, h: nh });
      }
    },
    [scale, mode],
  );

  const onPointerUp = useCallback(() => {
    if (drawingCalibRef.current && calibLine) {
      const lengthPx = Math.hypot(calibLine.x2 - calibLine.x1, calibLine.y2 - calibLine.y1);
      if (lengthPx > 0) {
        setCalibLines((prev) => {
          const next = [...prev, calibLine];
          setSelectedCalibLine(next.length - 1);
          return next;
        });
      }
      setCalibLine(null);
    }
    drawingCalibRef.current = false;
    if (drawingDiamRef.current && diamLine) {
      const lengthPx = Math.hypot(diamLine.x2 - diamLine.x1, diamLine.y2 - diamLine.y1);
      if (lengthPx > 0) {
        setDiamLines((prev) => {
          const next = [...prev, diamLine];
          setSelectedDiamLine(next.length - 1);
          return next;
        });
      }
      setDiamLine(null);
    }
    drawingDiamRef.current = false;
    dragRef.current = null;
  }, [calibLine, diamLine]);

  const resetCircles = useCallback(() => {
    if (!imageWidth || !imageHeight) return;
    const s = suggestInitialCircles(imageWidth, imageHeight);
    setInner(s.inner);
    setOuter(s.outer);
    setDiam(s.diam);
  }, [imageWidth, imageHeight]);

  const closeAllRightPanels = useCallback(() => {
    setIsInnerAdjustOpen(false);
    setIsOuterAdjustOpen(false);
    setIsDiamAdjustOpen(false);
    setIsMmpxAdjustOpen(false);
    setIsThicknessAdjustOpen(false);
    setIsImageAdjustOpen(false);
    setIsResetAdjustOpen(false);
  }, []);

  const openInnerAdjust = useCallback(() => {
    if (!inner && imageWidth > 0 && imageHeight > 0) {
      const s = suggestInitialCircles(imageWidth, imageHeight);
      setInner(s.inner);
    }
    closeAllRightPanels();
    setMode("inner");
    setIsInnerAdjustOpen(true);
    setInnerShape((prev) => ensurePointOffsets(prev));
  }, [inner, imageWidth, imageHeight, closeAllRightPanels]);

  const autoDetectInnerRing = useCallback(() => {
    if (!imageRef.current || !imgReady || imageWidth <= 0 || imageHeight <= 0) {
      return;
    }
    setDetectingInner(true);
    requestAnimationFrame(() => {
      try {
        const result = detectInnerRingFromImage(imageRef.current!, {
          outer,
          sourceWidth: imageWidth,
          sourceHeight: imageHeight,
          polygonSides: 36,
          seedCenter: outer
            ? { cx: outer.cx, cy: outer.cy }
            : { cx: imageWidth / 2, cy: imageHeight / 2 },
        });
        if (!result.ok) return;
        const { shape } = result;
        setInner(shape.circle);
        setInnerShape(
          ensurePointOffsets({
            mode: shape.mode,
            sides: shape.sides,
            rotationDeg: shape.rotationDeg,
            pointOffsets: shape.pointOffsets,
          }),
        );
        setSelectedPolyPoint(null);
        setSelectedPolyEdges([]);
      } catch {
        // keep silent — user can place manually
      } finally {
        setDetectingInner(false);
      }
    });
  }, [imgReady, imageWidth, imageHeight, outer]);

  const openOuterAdjust = useCallback(() => {
    if (!outer && imageWidth > 0 && imageHeight > 0) {
      const s = suggestInitialCircles(imageWidth, imageHeight);
      setOuter(s.outer);
    }
    closeAllRightPanels();
    setMode("outer");
    setIsOuterAdjustOpen(true);
    setOuterShape((prev) => ensurePointOffsets(prev));
  }, [outer, imageWidth, imageHeight, closeAllRightPanels]);

  const autoDetectOuterRing = useCallback(() => {
    if (!imageRef.current || !imgReady || imageWidth <= 0 || imageHeight <= 0) {
      return;
    }
    setDetectingOuter(true);
    requestAnimationFrame(() => {
      try {
        // Prefer locking outer scan to the current inner centre when available.
        let seedInner = inner;
        if (!seedInner) {
          const innerResult = detectInnerRingFromImage(imageRef.current!, {
            sourceWidth: imageWidth,
            sourceHeight: imageHeight,
            polygonSides: 36,
            seedCenter: { cx: imageWidth / 2, cy: imageHeight / 2 },
          });
          if (innerResult.ok) {
            seedInner = innerResult.shape.circle;
            setInner(innerResult.shape.circle);
            setInnerShape(
              ensurePointOffsets({
                mode: innerResult.shape.mode,
                sides: innerResult.shape.sides,
                rotationDeg: innerResult.shape.rotationDeg,
                pointOffsets: innerResult.shape.pointOffsets,
              }),
            );
          }
        }

        const result = detectOuterRingFromImage(imageRef.current!, {
          inner: seedInner,
          sourceWidth: imageWidth,
          sourceHeight: imageHeight,
          polygonSides: 48,
          circleTolerance: 0.025,
          maxWorkingSize: 520,
          seedCenter: seedInner
            ? { cx: seedInner.cx, cy: seedInner.cy }
            : { cx: imageWidth / 2, cy: imageHeight / 2 },
        });
        if (!result.ok) return;
        const { shape } = result;
        setOuter(shape.circle);
        setOuterShape(
          ensurePointOffsets({
            mode: shape.mode,
            sides: shape.sides,
            rotationDeg: shape.rotationDeg,
            pointOffsets: shape.pointOffsets,
          }),
        );
        setSelectedOuterPolyPoint(null);
        setSelectedOuterPolyEdges([]);
      } catch {
        // keep silent — user can place manually
      } finally {
        setDetectingOuter(false);
      }
    });
  }, [imgReady, imageWidth, imageHeight, inner]);

  /** Hybrid AI: provider guidance + pixel-accurate local refinement. */
  const runAiAnalysis = useCallback(() => {
    if (!aiAnalysisEnabled || !imageRef.current || !imgReady || imageWidth <= 0 || imageHeight <= 0) {
      return;
    }
    setDetectingAi(true);
    setAiStatus("Preparing image…");
    closeAllRightPanels();

    void (async () => {
      try {
        const img = imageRef.current!;
        const encoded = await encodeImageForAiAnalysis(img, imageWidth, imageHeight, 1024, 0.82);
        setAiStatus("AI scanning…");

        const res = await fetch("/api/ai/analyze-ring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: encoded.base64,
            mimeType: encoded.mimeType,
            sourceWidth: imageWidth,
            sourceHeight: imageHeight,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          guidance?: AiRingGuidance;
        };
        if (!res.ok || !data.ok || !data.guidance) {
          setAiStatus(data.error ?? "AI analysis failed.");
          return;
        }

        setAiStatus("Refining edges…");
        const refined = refineAiRingGeometry(img, data.guidance, imageWidth, imageHeight);

        setInner(refined.inner.circle);
        setInnerShape(
          ensurePointOffsets({
            mode: refined.inner.mode,
            sides: refined.inner.sides,
            rotationDeg: refined.inner.rotationDeg,
            pointOffsets: refined.inner.pointOffsets,
          }),
        );
        setOuter(refined.outer.circle);
        setOuterShape(
          ensurePointOffsets({
            mode: refined.outer.mode,
            sides: refined.outer.sides,
            rotationDeg: refined.outer.rotationDeg,
            pointOffsets: refined.outer.pointOffsets,
          }),
        );
        setDiamLine(null);
        setDiamLines(refined.diamLines);
        setSelectedDiamLine(refined.diamLines.length ? 0 : null);
        setSelectedPolyPoint(null);
        setSelectedPolyEdges([]);
        setSelectedOuterPolyPoint(null);
        setSelectedOuterPolyEdges([]);
        setThicknessApplied(true);
        setThicknessAngleOffsetsDeg(
          refined.thicknessAngleOffsetsDeg.length === T_LABELS.length
            ? refined.thicknessAngleOffsetsDeg
            : Array.from({ length: T_LABELS.length }, () => 0),
        );
        setThicknessDeltaPx(Array.from({ length: T_LABELS.length }, () => 0));

        if (refined.scale) {
          setCalibLines([refined.scale.line]);
          setSelectedCalibLine(0);
          setCalibRefMm(String(refined.scale.distanceMm));
          setScaleMmPerPx(refined.scale.mmPerPx.toFixed(6));
        }

        setMode("view");
        const confPct = Math.round(refined.confidence * 100);
        setAiStatus(
          refined.scale
            ? `Done (${confPct}% confidence) · scale ${refined.scale.mmPerPx.toFixed(4)} mm/px`
            : `Done (${confPct}% confidence)`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI analysis failed.";
        setAiStatus(msg.slice(0, 220));
      } finally {
        setDetectingAi(false);
      }
    })();
  }, [aiAnalysisEnabled, imgReady, imageWidth, imageHeight, closeAllRightPanels]);

  const toggleImageAdjust = useCallback(() => {
    if (isImageAdjustOpen) {
      setIsImageAdjustOpen(false);
      return;
    }
    setIsInnerAdjustOpen(false);
    setIsOuterAdjustOpen(false);
    setIsDiamAdjustOpen(false);
    setIsMmpxAdjustOpen(false);
    setIsThicknessAdjustOpen(false);
    setIsResetAdjustOpen(false);
    setIsImageAdjustOpen(true);
  }, [isImageAdjustOpen]);

  const closeInnerAdjust = useCallback(() => {
    setIsInnerAdjustOpen(false);
    setSelectedPolyPoint(null);
    setSelectedPolyEdges([]);
  }, []);
  const closeOuterAdjust = useCallback(() => {
    setIsOuterAdjustOpen(false);
    setSelectedOuterPolyPoint(null);
    setSelectedOuterPolyEdges([]);
  }, []);

  const changeDraftRadius = useCallback((delta: number) => {
    if (mode === "outer") {
      setOuter((prev) => (prev ? { ...prev, r: Math.max(MIN_INNER_RADIUS, prev.r + delta) } : prev));
      return;
    }
    setInner((prev) => (prev ? { ...prev, r: Math.max(MIN_INNER_RADIUS, prev.r + delta) } : prev));
  }, [mode]);

  const moveDraft = useCallback((dx: number, dy: number) => {
    if (mode === "outer") {
      setOuter((prev) => (prev ? { ...prev, cx: prev.cx + dx, cy: prev.cy + dy } : prev));
      return;
    }
    setInner((prev) => (prev ? { ...prev, cx: prev.cx + dx, cy: prev.cy + dy } : prev));
  }, [mode]);

  const rotateDraft = useCallback((deltaDeg: number) => {
    if (mode === "outer") {
      setOuterShape((prev) => ({ ...prev, rotationDeg: normalizeDeg(prev.rotationDeg + deltaDeg) }));
      return;
    }
    setInnerShape((prev) => ({ ...prev, rotationDeg: normalizeDeg(prev.rotationDeg + deltaDeg) }));
  }, [mode]);
  const nudgeSelectedPolyPoint = useCallback((dx: number, dy: number) => {
    setInnerShape((prev) => {
      if (selectedPolyPoint === null || prev.mode !== "polygon") return prev;
      const next = ensurePointOffsets(prev);
      if (!next.pointOffsets[selectedPolyPoint]) return next;
      const offsets = next.pointOffsets.map((p) => ({ ...p }));
      offsets[selectedPolyPoint] = {
        dx: offsets[selectedPolyPoint].dx + dx,
        dy: offsets[selectedPolyPoint].dy + dy,
      };
      return { ...next, pointOffsets: offsets };
    });
  }, [selectedPolyPoint]);
  const nudgeSelectedOuterPolyPoint = useCallback((dx: number, dy: number) => {
    setOuterShape((prev) => {
      if (selectedOuterPolyPoint === null || prev.mode !== "polygon") return prev;
      const next = ensurePointOffsets(prev);
      if (!next.pointOffsets[selectedOuterPolyPoint]) return next;
      const offsets = next.pointOffsets.map((p) => ({ ...p }));
      offsets[selectedOuterPolyPoint] = {
        dx: offsets[selectedOuterPolyPoint].dx + dx,
        dy: offsets[selectedOuterPolyPoint].dy + dy,
      };
      return { ...next, pointOffsets: offsets };
    });
  }, [selectedOuterPolyPoint]);

  const onCanvasKeyDown = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const step = e.shiftKey ? 5 : 1;
    if (mode === "inner" && (selectedPolyPoint === null || innerShape.mode !== "polygon")) return;
    if (mode === "outer" && (selectedOuterPolyPoint === null || outerShape.mode !== "polygon")) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (mode === "outer") nudgeSelectedOuterPolyPoint(0, -step);
      else nudgeSelectedPolyPoint(0, -step);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (mode === "outer") nudgeSelectedOuterPolyPoint(0, step);
      else nudgeSelectedPolyPoint(0, step);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (mode === "outer") nudgeSelectedOuterPolyPoint(-step, 0);
      else nudgeSelectedPolyPoint(-step, 0);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (mode === "outer") nudgeSelectedOuterPolyPoint(step, 0);
      else nudgeSelectedPolyPoint(step, 0);
    }
  }, [mode, selectedPolyPoint, selectedOuterPolyPoint, innerShape.mode, outerShape.mode, nudgeSelectedPolyPoint, nudgeSelectedOuterPolyPoint]);

  const deleteInnerRing = useCallback(() => {
    setInner(null);
    setInnerShape(DEFAULT_INNER_SHAPE);
    setIsInnerAdjustOpen(false);
    setSelectedPolyPoint(null);
    setSelectedPolyEdges([]);
    setThicknessApplied(false);
    if (mode === "inner") setMode("view");
  }, [mode]);
  const deleteOuterRing = useCallback(() => {
    setOuter(null);
    setOuterShape(DEFAULT_INNER_SHAPE);
    setIsOuterAdjustOpen(false);
    setSelectedOuterPolyPoint(null);
    setSelectedOuterPolyEdges([]);
    setThicknessApplied(false);
    if (mode === "outer") setMode("view");
  }, [mode]);

  /** Clear all drawn analysis overlays; keep the loaded image and mm/px scale. */
  const resetAllDrawings = useCallback(() => {
    setInner(null);
    setOuter(null);
    setDiam(null);
    setDiamLine(null);
    setDiamLines([]);
    setSelectedDiamLine(null);
    setInnerShape(DEFAULT_INNER_SHAPE);
    setOuterShape(DEFAULT_INNER_SHAPE);
    setThicknessApplied(false);
    setThicknessAngleOffsetsDeg(Array.from({ length: 8 }, () => 0));
    setThicknessDeltaPx(Array.from({ length: 8 }, () => 0));
    setSelectedThicknessKey("none");
    setSelectedPolyPoint(null);
    setSelectedOuterPolyPoint(null);
    setSelectedPolyEdges([]);
    setSelectedOuterPolyEdges([]);
    setIsInnerAdjustOpen(false);
    setIsOuterAdjustOpen(false);
    setIsDiamAdjustOpen(false);
    setIsMmpxAdjustOpen(false);
    setIsThicknessAdjustOpen(false);
    setIsImageAdjustOpen(false);
    setIsResetAdjustOpen(false);
    setMode("view");
    setAiStatus(null);
    setDetectingAi(false);
  }, []);

  const openResetAdjust = useCallback(() => {
    if (isResetAdjustOpen) {
      setIsResetAdjustOpen(false);
      setMode("view");
      return;
    }
    closeAllRightPanels();
    setMode("view");
    setIsResetAdjustOpen(true);
  }, [isResetAdjustOpen, closeAllRightPanels]);

  const closeResetAdjust = useCallback(() => {
    setIsResetAdjustOpen(false);
    setMode("view");
  }, []);

  const hasAnyDrawing = !!(inner || outer || diamLines.length > 0 || thicknessApplied);
  const activateDiameterMode = useCallback(() => {
    closeAllRightPanels();
    setMode("diam");
    setIsDiamAdjustOpen(true);
  }, [closeAllRightPanels]);

  /** Draw two perpendicular diameters through outer (or inner) ring centre. */
  const autoDrawPerpendicularDiameters = useCallback(() => {
    const ring = outer ?? inner;
    if (!ring) return;
    const shape = outer ? outerShape : innerShape;
    const horizontal = diameterLineThroughRing(ring, shape, 0);
    const vertical = diameterLineThroughRing(ring, shape, 90);

    setDiamLine(null);
    setDiamLines([horizontal, vertical]);
    setSelectedDiamLine(0);
  }, [outer, inner, outerShape, innerShape]);

  /** Rotate diameters around ring centre, then re-clamp to outer/inner edge. */
  const rotateDiameterLines = useCallback(
    (deltaDeg: number) => {
      if (diamLines.length === 0) return;
      const ring = outer ?? inner;
      if (!ring) {
        // No ring — pure geometric rotate as fallback
        const cx =
          diamLines.reduce((sum, l) => sum + (l.x1 + l.x2) / 2, 0) / diamLines.length;
        const cy =
          diamLines.reduce((sum, l) => sum + (l.y1 + l.y2) / 2, 0) / diamLines.length;
        const rad = (deltaDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        setDiamLines((prev) =>
          prev.map((line) => {
            const rot = (x: number, y: number) => {
              const dx = x - cx;
              const dy = y - cy;
              return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
            };
            const p1 = rot(line.x1, line.y1);
            const p2 = rot(line.x2, line.y2);
            return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
          }),
        );
        setDiamLine(null);
        return;
      }

      const shape = outer ? outerShape : innerShape;
      setDiamLines((prev) =>
        prev.map((line) => {
          const midX = (line.x1 + line.x2) / 2;
          const midY = (line.y1 + line.y2) / 2;
          // Prefer direction from ring centre through the line (more stable than endpoints alone)
          const dx = line.x2 - line.x1;
          const dy = line.y2 - line.y1;
          let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
          // If line doesn't pass near centre, use vector from centre to midpoint + half-angle
          const distMid = Math.hypot(midX - ring.cx, midY - ring.cy);
          if (distMid > 2) {
            angleDeg = (Math.atan2(midY - ring.cy, midX - ring.cx) * 180) / Math.PI;
          }
          return diameterLineThroughRing(ring, shape, angleDeg + deltaDeg);
        }),
      );
      setDiamLine(null);
    },
    [diamLines.length, outer, inner, outerShape, innerShape],
  );

  const activateMmpxMode = useCallback(() => {
    closeAllRightPanels();
    setMode("mmpx");
    setIsMmpxAdjustOpen(true);
  }, [closeAllRightPanels]);

  useEffect(() => {
    if (!toolbarApiRef) return;
    toolbarApiRef.current = {
      openMmpx: activateMmpxMode,
      runAiAnalysis,
    };
    return () => {
      toolbarApiRef.current = null;
    };
  }, [toolbarApiRef, activateMmpxMode, runAiAnalysis]);

  useEffect(() => {
    onToolbarStateChange?.({
      detectingAi,
      aiStatus,
      mmpxActive: mode === "mmpx" || isMmpxAdjustOpen,
      imgReady,
      aiAnalysisEnabled,
    });
  }, [
    onToolbarStateChange,
    detectingAi,
    aiStatus,
    mode,
    isMmpxAdjustOpen,
    imgReady,
    aiAnalysisEnabled,
  ]);

  const openThicknessAdjust = useCallback(() => {
    if (!inner || !outer) return;
    closeAllRightPanels();
    setMode("thick");
    setIsThicknessAdjustOpen(true);
    setThicknessApplied(true);
  }, [inner, outer, closeAllRightPanels]);
  const deleteSelectedDiameterLine = useCallback(() => {
    if (selectedDiamLine === null) return;
    setDiamLines((prev) => {
      const next = prev.filter((_, idx) => idx !== selectedDiamLine);
      setSelectedDiamLine(next.length ? Math.min(selectedDiamLine, next.length - 1) : null);
      return next;
    });
  }, [selectedDiamLine]);
  const deleteSelectedCalibLine = useCallback(() => {
    if (selectedCalibLine === null) return;
    setCalibLines((prev) => {
      const next = prev.filter((_, idx) => idx !== selectedCalibLine);
      setSelectedCalibLine(next.length ? Math.min(selectedCalibLine, next.length - 1) : null);
      return next;
    });
  }, [selectedCalibLine]);
  const closeDiamAdjust = useCallback(() => {
    setIsDiamAdjustOpen(false);
  }, []);
  const closeMmpxAdjust = useCallback(() => {
    setIsMmpxAdjustOpen(false);
  }, []);
  const closeThicknessAdjust = useCallback(() => {
    setIsThicknessAdjustOpen(false);
    if (mode === "thick") setMode("view");
    // thicknessApplied stays true — markers remain on canvas
  }, [mode]);

  const clearThicknessPoints = useCallback(() => {
    setThicknessApplied(false);
    setThicknessAngleOffsetsDeg(Array.from({ length: 8 }, () => 0));
    setThicknessDeltaPx(Array.from({ length: 8 }, () => 0));
    setSelectedThicknessKey("none");
    setIsThicknessAdjustOpen(false);
    if (mode === "thick") setMode("view");
  }, [mode]);
  const selectedThicknessIndexes = useMemo(() => {
    if (selectedThicknessKey === "all") return Array.from({ length: 8 }, (_, i) => i);
    if (selectedThicknessKey === "none") return [];
    return [selectedThicknessKey];
  }, [selectedThicknessKey]);
  const moveSelectedThicknessAlong = useCallback((deltaDeg: number) => {
    if (selectedThicknessIndexes.length === 0) return;
    setThicknessAngleOffsetsDeg((prev) => {
      const next = [...prev];
      selectedThicknessIndexes.forEach((idx) => {
        next[idx] += deltaDeg;
      });
      return next;
    });
  }, [selectedThicknessIndexes]);
  const resizeSelectedThickness = useCallback((deltaPx: number) => {
    if (selectedThicknessIndexes.length === 0) return;
    setThicknessDeltaPx((prev) => {
      const next = [...prev];
      selectedThicknessIndexes.forEach((idx) => {
        next[idx] += deltaPx;
      });
      return next;
    });
  }, [selectedThicknessIndexes]);
  const nudgeSelectedDiameterLine = useCallback((dx: number, dy: number) => {
    if (selectedDiamLine === null) return;
    setDiamLines((prev) =>
      prev.map((line, idx) =>
        idx === selectedDiamLine
          ? { x1: line.x1 + dx, y1: line.y1 + dy, x2: line.x2 + dx, y2: line.y2 + dy }
          : line,
      ),
    );
  }, [selectedDiamLine]);
  const nudgeSelectedCalibLine = useCallback((dx: number, dy: number) => {
    if (selectedCalibLine === null) return;
    setCalibLines((prev) =>
      prev.map((line, idx) =>
        idx === selectedCalibLine
          ? { x1: line.x1 + dx, y1: line.y1 + dy, x2: line.x2 + dx, y2: line.y2 + dy }
          : line,
      ),
    );
  }, [selectedCalibLine]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 md:flex-row md:items-stretch md:gap-3">
      <aside className="card flex w-full shrink-0 flex-col border border-[--color-border] p-2 md:h-full md:w-[20%] md:overflow-y-auto">
        <p className="mb-2 hidden px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 md:block">
          Tools
        </p>
        <nav
          className="flex gap-2 overflow-x-auto pb-0.5 md:flex-col md:overflow-visible md:pb-0 [&>button]:min-w-[8.5rem] [&>button]:shrink-0 [&>button]:justify-start [&>button]:whitespace-nowrap [&>button]:px-2.5 [&>button]:py-2 [&>button]:text-left [&>button]:text-xs md:[&>button]:min-w-0 md:[&>button]:w-full md:[&>button]:text-sm"
          aria-label="Analysis tools"
        >
          {!hideHeaderToolsInSidebar ? extraControls : null}
          <button
            type="button"
            onClick={toggleImageAdjust}
            aria-pressed={isImageAdjustOpen}
            className={
              isImageAdjustOpen
                ? "inline-flex items-center gap-2 rounded-lg border-2 border-cyan-400 bg-cyan-400/20 px-3 py-1.5 text-sm font-semibold text-white"
                : "inline-flex items-center gap-2 rounded-lg border border-[--color-border-strong] bg-slate-800/50 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-700"
            }
          >
            <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-400" />
            Image Adjust
          </button>
          {!hideHeaderToolsInSidebar ? (
            <>
              <ModeButton current={mode} target="mmpx" onClick={activateMmpxMode} color={MMPX_LINE_COLOR}>
                mm/px
              </ModeButton>
              {aiAnalysisEnabled ? (
                <div className="flex w-full flex-col gap-1">
                  <button
                    type="button"
                    onClick={runAiAnalysis}
                    disabled={detectingAi || !imageSrc || !imgReady}
                    className={
                      detectingAi
                        ? "inline-flex items-center gap-2 rounded-lg border-2 border-violet-400 bg-violet-400/20 px-3 py-1.5 text-sm font-semibold text-white"
                        : "inline-flex items-center gap-2 rounded-lg border border-violet-400/60 bg-violet-500/15 px-3 py-1.5 text-sm font-medium text-violet-100 hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                    }
                  >
                    <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-violet-400" />
                    {detectingAi ? "AI Analyzing…" : "AI Analysis"}
                  </button>
                  {aiStatus ? (
                    <p
                      className={
                        aiStatus.startsWith("Done")
                          ? "px-1 text-[10px] leading-snug text-emerald-300/90"
                          : detectingAi
                            ? "px-1 text-[10px] leading-snug text-violet-200/80"
                            : "px-1 text-[10px] leading-snug text-amber-200/90"
                      }
                    >
                      {aiStatus}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
          <ModeButton current={mode} target="inner" onClick={openInnerAdjust} color={style.inner.color}>
            Inner Ring
          </ModeButton>
          <ModeButton current={mode} target="outer" onClick={openOuterAdjust} color={style.outer.color}>
            Outer Ring
          </ModeButton>
          <ModeButton current={mode} target="diam" onClick={activateDiameterMode} color={style.diam.color}>
            Diameter
          </ModeButton>
          <ModeButton
            current={mode}
            target="thick"
            onClick={openThicknessAdjust}
            color={style.thick.color}
            disabled={!inner || !outer}
          >
            Thickness Points
          </ModeButton>
          <button
            type="button"
            onClick={openResetAdjust}
            aria-pressed={isResetAdjustOpen}
            className={
              isResetAdjustOpen
                ? "inline-flex items-center gap-2 rounded-lg border-2 border-amber-400 bg-amber-400/20 px-3 py-1.5 text-sm font-semibold text-white"
                : "inline-flex items-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-100 hover:bg-amber-500/20"
            }
            title="Open reset drawing settings"
          >
            <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" />
            Reset Drawing
          </button>
        </nav>
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-stretch">
            <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center [container-type:size]">
            <div
              ref={containerRef}
              className="card-subtle relative flex aspect-square size-[min(100cqw,100cqh)] min-h-0 min-w-0 items-center justify-center overflow-auto"
            >
            {cameraOn ? (
              <video
                ref={cameraVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 z-10 h-full w-full object-contain bg-black/70"
              />
            ) : null}
            <canvas
              ref={canvasRef}
              className="block max-h-full max-w-full touch-none select-none"
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onCanvasKeyDown}
            />
            {canvasOverlay ? (
              <div className="pointer-events-none absolute right-2 bottom-2 z-20 sm:right-3 sm:bottom-3">
                {canvasOverlay}
              </div>
            ) : null}
            </div>
            </div>
            {isImageAdjustOpen ||
            isInnerAdjustOpen ||
            isOuterAdjustOpen ||
            isDiamAdjustOpen ||
            isMmpxAdjustOpen ||
            isThicknessAdjustOpen ||
            isResetAdjustOpen ? (
            <div className="flex h-full w-full shrink-0 flex-col gap-2 overflow-y-auto md:w-[20%]">
            {isResetAdjustOpen ? (
              <div className="card-subtle w-full space-y-3 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center">
                  <h3 className="text-sm font-semibold text-white">Reset Drawing</h3>
                </div>
                <p className="text-[10px] leading-snug text-slate-400">
                  Clear all drawn overlays on this image. Image and mm/px scale stay unchanged.
                </p>
                <ul className="space-y-1 rounded-md border border-[--color-border-strong] bg-slate-900/40 px-2 py-2 text-left text-[10px] text-slate-300">
                  <li className={inner ? "text-amber-100" : "text-slate-500"}>
                    • Inner Ring {inner ? "(drawn)" : "(empty)"}
                  </li>
                  <li className={outer ? "text-amber-100" : "text-slate-500"}>
                    • Outer Ring {outer ? "(drawn)" : "(empty)"}
                  </li>
                  <li className={diamLines.length > 0 ? "text-amber-100" : "text-slate-500"}>
                    • Diameter {diamLines.length > 0 ? `(${diamLines.length})` : "(empty)"}
                  </li>
                  <li className={thicknessApplied ? "text-amber-100" : "text-slate-500"}>
                    • Thickness Points {thicknessApplied ? "(on)" : "(off)"}
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={resetAllDrawings}
                  disabled={!hasAnyDrawing}
                  className="w-full rounded-md border border-amber-400/70 bg-amber-500/20 px-2 py-2 text-xs font-semibold text-amber-50 hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reset All Drawings
                </button>
                <button
                  type="button"
                  onClick={closeResetAdjust}
                  className="w-full rounded-md border border-[--color-border-strong] px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            ) : null}
            {isInnerAdjustOpen ||
            isOuterAdjustOpen ||
            isDiamAdjustOpen ||
            isMmpxAdjustOpen ||
            isThicknessAdjustOpen ? (
              <div className="card-subtle w-full space-y-3 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center">
                  <h3 className="text-sm font-semibold text-white">
                    {mode === "mmpx"
                      ? "Adjust mm/px"
                      : mode === "diam"
                      ? "Adjust Diameter"
                      : mode === "thick"
                        ? "Adjust Thickness Points"
                        : mode === "outer"
                          ? "Adjust Outer Ring"
                          : "Adjust Inner Ring"}
                  </h3>
                </div>
                {mode === "mmpx" ? (
                  <>
                    <div className="space-y-2 text-center">
                      <p className="text-xs font-medium text-[--color-muted]">Line length (mm)</p>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={calibRefMm}
                        onChange={(e) => setCalibRefMm(e.target.value)}
                        placeholder="Known length"
                        className="input h-8 text-center font-mono text-xs"
                      />
                      <p className="text-[10px] leading-snug text-slate-400">
                        Enter known line length, then draw the line. Scale appears below.
                      </p>
                    </div>
                    <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-2 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-cyan-200/80">Active Scale</p>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-cyan-100">
                        {mmPerPx > 0 ? `${mmPerPx.toFixed(4)} mm/px` : "—"}
                      </p>
                    </div>
                    <div className="space-y-2 text-center">
                      <p className="text-xs font-medium text-[--color-muted]">Calib Lines</p>
                      <div className="max-h-28 space-y-1 overflow-auto rounded-md border border-[--color-border-strong] bg-slate-900/30 p-1">
                        {calibLines.length === 0 ? (
                          <div className="text-xs text-[--color-muted]">Draw line on canvas</div>
                        ) : (
                          calibLines.map((line, idx) => {
                            const len = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
                            const refMm = Number(calibRefMm);
                            const scaleVal =
                              Number.isFinite(refMm) && refMm > 0 && len > 0 ? refMm / len : null;
                            return (
                              <button
                                key={`calib-${line.x1}-${line.y1}-${idx}`}
                                type="button"
                                onClick={() => setSelectedCalibLine(idx)}
                                className={
                                  selectedCalibLine === idx
                                    ? "w-full rounded-md border border-cyan-300 bg-cyan-300/20 px-2 py-1 text-xs text-cyan-100"
                                    : "w-full rounded-md border border-[--color-border-strong] bg-slate-800/40 px-2 py-1 text-xs text-slate-300"
                                }
                              >
                                C{idx + 1} · {len.toFixed(1)} px
                                {scaleVal !== null ? ` · ${scaleVal.toFixed(4)}` : ""}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 text-center">
                      <p className="text-xs font-medium text-[--color-muted]">Move Line</p>
                      <div className="mx-auto grid w-fit grid-cols-3 gap-2 text-xs">
                        <div />
                        <button type="button" onClick={() => nudgeSelectedCalibLine(0, -5)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-white">↑</button>
                        <div />
                        <button type="button" onClick={() => nudgeSelectedCalibLine(-5, 0)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-white">←</button>
                        <button type="button" onClick={() => nudgeSelectedCalibLine(0, 5)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-white">↓</button>
                        <button type="button" onClick={() => nudgeSelectedCalibLine(5, 0)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-white">→</button>
                      </div>
                    </div>
                    <div className="flex justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={closeMmpxAdjust}
                        className="rounded-md border border-[--color-border-strong] px-3 py-1.5 text-xs font-medium text-slate-300"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={deleteSelectedCalibLine}
                        disabled={selectedCalibLine === null}
                        className="rounded-md border border-cyan-300 bg-cyan-300/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                ) : mode === "diam" ? (
                  <>
                    <div className="space-y-2 text-center">
                      <button
                        type="button"
                        onClick={autoDrawPerpendicularDiameters}
                        disabled={!outer && !inner}
                        className="w-full rounded-md border border-orange-400/70 bg-orange-400/15 px-3 py-1.5 text-xs font-semibold text-orange-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Auto Draw Diameter
                      </button>
                    </div>
                    <div className="rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-1.5 text-center text-[10px] text-orange-100/90">
                      Dia = line px × {mmPerPx > 0 ? `${mmPerPx.toFixed(4)} mm/px` : "(set mm/px first)"}
                    </div>
                    <div className="space-y-2 text-center">
                      <p className="text-xs font-medium text-[--color-muted]">Lines</p>
                      <div className="max-h-28 space-y-1 overflow-auto rounded-md border border-[--color-border-strong] bg-slate-900/30 p-1">
                        {diamLines.length === 0 ? (
                          <div className="text-xs text-[--color-muted]">Draw lines on canvas</div>
                        ) : (
                          diamLines.map((line, idx) => {
                            const len = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
                            return (
                              <button
                                key={`${line.x1}-${line.y1}-${idx}`}
                                type="button"
                                onClick={() => setSelectedDiamLine(idx)}
                                className={
                                  selectedDiamLine === idx
                                    ? "w-full rounded-md border border-yellow-300 bg-yellow-300/20 px-2 py-1 text-xs text-yellow-200"
                                    : "w-full rounded-md border border-[--color-border-strong] bg-slate-800/40 px-2 py-1 text-xs text-slate-300"
                                }
                              >
                                L{idx + 1} · {len.toFixed(1)} px
                                {mmPerPx > 0 ? ` · ${(len * mmPerPx).toFixed(2)} mm` : ""}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 text-center">
                      <p className="text-xs font-medium text-[--color-muted]">Move Line</p>
                      <div className="mx-auto grid w-fit grid-cols-3 gap-2 text-xs">
                        <div />
                        <button type="button" onClick={() => nudgeSelectedDiameterLine(0, -5)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-white">↑</button>
                        <div />
                        <button type="button" onClick={() => nudgeSelectedDiameterLine(-5, 0)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-white">←</button>
                        <button type="button" onClick={() => nudgeSelectedDiameterLine(0, 5)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-white">↓</button>
                        <button type="button" onClick={() => nudgeSelectedDiameterLine(5, 0)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-white">→</button>
                      </div>
                    </div>
                    <div className="space-y-2 text-center">
                      <p className="text-xs font-medium text-[--color-muted]">Rotate</p>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => rotateDiameterLines(-5)}
                          disabled={diamLines.length === 0}
                          className="rounded-md border border-[--color-border-strong] px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ↺ 5°
                        </button>
                        <button
                          type="button"
                          onClick={() => rotateDiameterLines(5)}
                          disabled={diamLines.length === 0}
                          className="rounded-md border border-[--color-border-strong] px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ↻ 5°
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={closeDiamAdjust}
                        className="rounded-md border border-[--color-border-strong] px-3 py-1.5 text-xs font-medium text-slate-300"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={deleteSelectedDiameterLine}
                        disabled={selectedDiamLine === null}
                        className="rounded-md border border-yellow-300 bg-yellow-300/20 px-3 py-1.5 text-xs font-semibold text-yellow-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                ) : mode === "thick" ? (
                  <>
                    <div className="space-y-2 text-center">
                      <p className="text-xs font-medium text-[--color-muted]">Points</p>
                      <div className="text-xs text-slate-300">{thicknessPairsDisplay.length} points active</div>
                    </div>
                    <div className="space-y-2 text-center">
                      <div className="grid grid-cols-5 overflow-hidden rounded-md border border-[--color-border-strong] text-xs">
                        {(["none", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "all"] as const).map((key) => {
                          const active =
                            (key === "none" && selectedThicknessKey === "none") ||
                            (key === "all" && selectedThicknessKey === "all") ||
                            (key.startsWith("t") && selectedThicknessKey === Number(key.slice(1)) - 1);
                          const label = key === "none" ? "N/A" : key === "all" ? "All" : key.toUpperCase();
                          const value =
                            key === "none"
                              ? "none"
                              : key === "all"
                                ? "all"
                                : Number(key.slice(1)) - 1;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setSelectedThicknessKey(value as "none" | "all" | number)}
                              className={
                                active
                                  ? "border border-yellow-300 bg-yellow-300/20 px-1 py-1 font-semibold text-yellow-200"
                                  : "border border-[--color-border-strong] bg-slate-800/40 px-1 py-1 text-slate-300"
                              }
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-2 text-center">
                      <p className="text-xs font-medium text-[--color-muted]">Shrink / Expand</p>
                      <div className="flex items-center justify-center gap-2">
                        <button type="button" onClick={() => resizeSelectedThickness(-2)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-xs text-white">
                          ➖
                        </button>
                        <button type="button" onClick={() => resizeSelectedThickness(2)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-xs text-white">
                          ➕
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 text-center">
                      <p className="text-xs font-medium text-[--color-muted]">Move Along Circumference</p>
                      <div className="flex items-center justify-center gap-2">
                        <button type="button" onClick={() => moveSelectedThicknessAlong(-5)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-xs text-white">
                          ↺ 5°
                        </button>
                        <button type="button" onClick={() => moveSelectedThicknessAlong(5)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-xs text-white">
                          ↻ 5°
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={closeThicknessAdjust}
                        className="rounded-md border border-[--color-border-strong] px-3 py-1.5 text-xs font-medium text-slate-300"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={clearThicknessPoints}
                        className="rounded-md border border-yellow-300 bg-yellow-300/20 px-3 py-1.5 text-xs font-semibold text-yellow-200"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                ) : (
                  <>

                {mode === "inner" ? (
                  <div className="space-y-2 text-center">
                    <button
                      type="button"
                      onClick={autoDetectInnerRing}
                      disabled={detectingInner || !imageSrc}
                      className="w-full rounded-md border border-cyan-400/70 bg-cyan-400/15 px-3 py-1.5 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {detectingInner ? "Scanning…" : "Auto Detect Inner Ring"}
                    </button>
                  </div>
                ) : null}

                {mode === "outer" ? (
                  <div className="space-y-2 text-center">
                    <button
                      type="button"
                      onClick={autoDetectOuterRing}
                      disabled={detectingOuter || !imageSrc}
                      className="w-full rounded-md border border-fuchsia-400/70 bg-fuchsia-400/15 px-3 py-1.5 text-xs font-semibold text-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {detectingOuter ? "Scanning…" : "Auto Detect Outer Ring"}
                    </button>
                  </div>
                ) : null}

                <div className="space-y-2 text-center">
                  <p className="text-xs font-medium text-[--color-muted]">Shape</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {(["circle", "polygon"] as const).map((shapeMode) => (
                      <button
                        key={shapeMode}
                        type="button"
                        onClick={() =>
                          (mode === "outer" ? setOuterShape : setInnerShape)((prev) =>
                            ensurePointOffsets({
                              ...prev,
                              mode: shapeMode,
                            }),
                          )
                        }
                        className={
                          (mode === "outer" ? outerShape.mode : innerShape.mode) === shapeMode
                            ? "rounded-md border border-yellow-300 bg-yellow-300/20 px-2 py-1 text-xs font-semibold text-yellow-200"
                            : "rounded-md border border-[--color-border-strong] bg-slate-800/40 px-2 py-1 text-xs text-slate-300"
                        }
                      >
                        {shapeMode === "circle" ? "Circle" : "Polygonal"}
                      </button>
                    ))}
                    <div className="inline-flex items-center gap-2 rounded-md border border-[--color-border-strong] bg-slate-900/40 px-2 py-1">
                      <span className="text-xs text-[--color-muted]">Sides</span>
                      <input
                        type="number"
                        min={3}
                        max={64}
                        value={mode === "outer" ? outerShape.sides : innerShape.sides}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          (mode === "outer" ? setOuterShape : setInnerShape)((prev) =>
                            ensurePointOffsets({
                              ...prev,
                              sides: Number.isFinite(next) ? Math.min(64, Math.max(3, Math.round(next))) : prev.sides,
                            }),
                          );
                        }}
                        className="w-16 rounded-md border border-[--color-border-strong] bg-slate-900/60 px-2 py-1 text-right text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-center">
                  <p className="text-xs font-medium text-[--color-muted]">📏 Size</p>
                  <div className="flex justify-center gap-2">
                    <button type="button" onClick={() => changeDraftRadius(-5)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-xs text-white">
                      ➖
                    </button>
                    <button type="button" onClick={() => changeDraftRadius(5)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-xs text-white">
                      ➕
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-center">
                  <p className="text-xs font-medium text-[--color-muted]">🔄 Rotate</p>
                  <div className="flex items-center justify-center gap-2">
                    <button type="button" onClick={() => rotateDraft(-5)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-xs text-white">
                      ↺ 5°
                    </button>
                    <button type="button" onClick={() => rotateDraft(5)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-xs text-white">
                      ↻ 5°
                    </button>
                    <span className="text-xs text-[--color-muted]">
                      🧭 {(mode === "outer" ? outerShape.rotationDeg : innerShape.rotationDeg).toFixed(0)}°
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-center">
                  <p className="text-xs font-medium text-[--color-muted]">Move Function</p>
                  <div className="mx-auto grid w-fit grid-cols-3 gap-2 text-xs">
                    <div />
                    <button type="button" onClick={() => moveDraft(0, -5)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-white">
                      ↑
                    </button>
                    <div />
                    <button type="button" onClick={() => moveDraft(-5, 0)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-white">
                      ←
                    </button>
                    <button type="button" onClick={() => moveDraft(0, 5)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-white">
                      ↓
                    </button>
                    <button type="button" onClick={() => moveDraft(5, 0)} className="rounded-md border border-[--color-border-strong] px-2 py-1 text-white">
                      →
                    </button>
                  </div>
                </div>

                <div className="flex justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={mode === "outer" ? closeOuterAdjust : closeInnerAdjust}
                    className="rounded-md border border-[--color-border-strong] px-3 py-1.5 text-xs font-medium text-slate-300"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={mode === "outer" ? deleteOuterRing : deleteInnerRing}
                    className="rounded-md border border-yellow-300 bg-yellow-300/20 px-3 py-1.5 text-xs font-semibold text-yellow-200"
                  >
                    Delete
                  </button>
                </div>
                  </>
                )}
              </div>
            ) : null}
            {isImageAdjustOpen ? (
            <div className="w-full overflow-hidden rounded-xl border border-[--color-border-strong] bg-slate-900/85 p-2 shadow-lg shadow-black/20">
              <div className="mb-1.5 border-b border-[--color-border] pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                Image Adjust
              </div>
              <div className="mb-1.5 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={autoEnhanceImage}
                  disabled={!imageSrc}
                  className="w-full rounded-md border border-emerald-400/60 bg-emerald-500/15 px-2 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Auto-adjust brightness, contrast & color from the image"
                >
                  ✨ Auto Enhance Quality
                </button>
                <button
                  type="button"
                  onClick={enhancePixels}
                  disabled={!imageSrc || !onImageReplace}
                  className="w-full rounded-md border border-sky-400/60 bg-sky-500/15 px-2 py-1.5 text-[11px] font-semibold text-sky-100 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Bake filters, upscale small images & sharpen pixels"
                >
                  🔎 Pixel Update (Sharpen)
                </button>
              </div>
              <div className="flex flex-col gap-1">
                <FilterRow
                  label="Brightness"
                  value={imageFilter.brightness}
                  min={50}
                  max={150}
                  onChange={(v) => applyImageFilterChange("brightness", v)}
                />
                <FilterRow
                  label="Contrast"
                  value={imageFilter.contrast}
                  min={50}
                  max={150}
                  onChange={(v) => applyImageFilterChange("contrast", v)}
                />
                <FilterRow
                  label="Color"
                  value={imageFilter.saturation}
                  min={50}
                  max={150}
                  onChange={(v) => applyImageFilterChange("saturation", v)}
                />
                <FilterRow
                  label="B/W"
                  value={imageFilter.grayscale}
                  min={0}
                  max={100}
                  onChange={(v) => applyImageFilterChange("grayscale", v)}
                />
                <FilterRow
                  label="Sepia"
                  value={imageFilter.sepia}
                  min={0}
                  max={100}
                  onChange={(v) => applyImageFilterChange("sepia", v)}
                />
                <FilterRow
                  label="Invert"
                  value={imageFilter.invert}
                  min={0}
                  max={100}
                  onChange={(v) => applyImageFilterChange("invert", v)}
                />
                <div className="flex items-center justify-center gap-1 rounded-md border border-[--color-border] bg-slate-900/40 px-1 py-1">
                  <button
                    type="button"
                    onClick={zoomOut}
                    className="rounded-md border border-[--color-border-strong] px-2 py-0.5 text-xs text-slate-100 hover:bg-slate-800"
                    title="Zoom Out"
                    aria-label="Zoom Out"
                  >
                    ➖
                  </button>
                  <button
                    type="button"
                    onClick={fitToWindow}
                    className="rounded-md border border-[--color-border-strong] px-2 py-0.5 text-[10px] text-slate-100 hover:bg-slate-800"
                    title="Fit to window"
                    aria-label="Fit to window"
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    onClick={zoomIn}
                    className="rounded-md border border-[--color-border-strong] px-2 py-0.5 text-xs text-slate-100 hover:bg-slate-800"
                    title="Zoom In"
                    aria-label="Zoom In"
                  >
                    ➕
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteImage}
                    disabled={!imageSrc}
                    className="rounded-md border border-red-400/70 bg-red-500/20 px-2 py-0.5 text-xs text-red-200 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                    title="Delete image"
                    aria-label="Delete image"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1 border-t border-[--color-border] pt-1.5">
                <button
                  type="button"
                  onClick={undoImageFilter}
                  className="rounded-md border border-[--color-border-strong] px-2 py-0.5 text-[10px] text-slate-200 hover:bg-slate-800"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={redoImageFilter}
                  className="rounded-md border border-[--color-border-strong] px-2 py-0.5 text-[10px] text-slate-200 hover:bg-slate-800"
                >
                  Redo
                </button>
                <button
                  type="button"
                  onClick={resetImageFilter}
                  className="col-span-2 rounded-md border border-[--color-border-strong] bg-slate-800/70 px-2 py-0.5 text-[10px] font-medium text-slate-100 hover:bg-slate-700"
                >
                  Reset All
                </button>
                <button
                  type="button"
                  onClick={() => rotateImage("left")}
                  className="rounded-md border border-[--color-border-strong] px-2 py-0.5 text-[10px] text-slate-200 hover:bg-slate-800"
                >
                  Rotate L
                </button>
                <button
                  type="button"
                  onClick={() => rotateImage("right")}
                  className="rounded-md border border-[--color-border-strong] px-2 py-0.5 text-[10px] text-slate-200 hover:bg-slate-800"
                >
                  Rotate R
                </button>
                <button
                  type="button"
                  onClick={() => flipImage("h")}
                  className="rounded-md border border-[--color-border-strong] px-2 py-0.5 text-[10px] text-slate-200 hover:bg-slate-800"
                >
                  Flip H
                </button>
                <button
                  type="button"
                  onClick={() => flipImage("v")}
                  className="rounded-md border border-[--color-border-strong] px-2 py-0.5 text-[10px] text-slate-200 hover:bg-slate-800"
                >
                  Flip V
                </button>
                <button
                  type="button"
                  onClick={cropCenter}
                  className="col-span-2 rounded-md border border-[--color-border-strong] px-2 py-0.5 text-[10px] text-slate-200 hover:bg-slate-800"
                >
                  Crop Center
                </button>
              </div>
            </div>
            ) : null}
            </div>
            ) : null}
          </div>
          {saveControl ? (
            <div className="mt-2 flex items-center justify-end gap-2">{saveControl}</div>
          ) : null}
        </div>

      </div>
    </div>
  );
}

function ModeButton({
  current,
  target,
  onClick,
  color,
  disabled,
  children,
}: {
  current: EditMode;
  target: EditMode;
  onClick: () => void;
  color: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const active = current === target;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        disabled
          ? "inline-flex w-full items-center gap-2 rounded-lg border border-[--color-border-strong] bg-slate-900/40 px-3 py-1.5 text-sm font-medium text-slate-500"
          : active
          ? "inline-flex w-full items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm font-semibold text-white"
          : "inline-flex w-full items-center gap-2 rounded-lg border border-[--color-border-strong] bg-slate-800/50 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-700"
      }
      style={!disabled && active ? { borderColor: color, background: `${color}22` } : undefined}
    >
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {children}
    </button>
  );
}

function FilterRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 rounded-md border border-[--color-border] bg-slate-900/40 px-1.5 py-1">
      <span className="w-[4.25rem] shrink-0 text-[10px] leading-tight text-slate-300">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-blue-400"
        aria-label={label}
      />
      <span className="w-7 shrink-0 text-right font-mono text-[10px] text-slate-400">{value}</span>
    </label>
  );
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Unsharp mask: sharpen = original + amount * (original - blurred). */
function unsharpMask(img: ImageData, w: number, h: number, amount: number): ImageData {
  const src = img.data;
  const out = new Uint8ClampedArray(src.length);
  // 3x3 box blur per channel, then combine.
  const idx = (x: number, y: number) => (y * w + x) * 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = idx(x, y);
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            sum += src[idx(xx, yy) + c]!;
            n++;
          }
        }
        const blurred = sum / n;
        const orig = src[o + c]!;
        out[o + c] = clampNum(orig + amount * (orig - blurred), 0, 255);
      }
      out[o + 3] = src[o + 3]!;
    }
  }
  return new ImageData(out, w, h);
}

function drawCenter(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save();
  ctx.fillStyle = "#0b1220";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawResizeHandles(
  ctx: CanvasRenderingContext2D,
  c: Circle,
  scale: number,
  color: string,
) {
  drawHandle(ctx, (c.cx + c.r) * scale, c.cy * scale, color);
}

function pointerImageCoords(
  e: React.PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
  scale: number,
) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / scale,
    y: (e.clientY - rect.top) / scale,
  };
}

function insideHandle(px: number, py: number, hx: number, hy: number) {
  const r = HANDLE_RADIUS / 1; // image-space tolerance
  return Math.hypot(px - hx, py - hy) <= r * 4;
}

function insidePolyVertexHandle(px: number, py: number, hx: number, hy: number) {
  // Tighter hitbox than generic handles so edge clicks aren't stolen by nearby vertices.
  return Math.hypot(px - hx, py - hy) <= 9;
}

function insideRingNear(px: number, py: number, c: Circle) {
  // Return true when the click is anywhere inside or near the circle
  return Math.hypot(px - c.cx, py - c.cy) <= c.r + 24;
}

function computeAdjustedThicknessPairs(args: {
  inner: Circle;
  outer: Circle;
  innerShape: InnerShapeConfig;
  outerShape: InnerShapeConfig;
  mmPerPx: number;
  angularOffsetDeg: number;
  angleOffsetsDeg: number[];
  thicknessDeltaPx: number[];
  outerGapPx: number;
  innerGapPx: number;
}) {
  const {
    inner,
    outer,
    innerShape,
    outerShape,
    mmPerPx,
    angularOffsetDeg,
    angleOffsetsDeg,
    thicknessDeltaPx,
    outerGapPx,
    innerGapPx,
  } = args;
  const cx = outer.cx;
  const cy = outer.cy;
  const innerPoly = innerShape.mode === "polygon" ? getPolygonPoints(inner, innerShape) : null;
  const outerPoly = outerShape.mode === "polygon" ? getPolygonPoints(outer, outerShape) : null;
  return T_LABELS.map(({ angle, label }, idx) => {
    const a = (angle + angularOffsetDeg + (angleOffsetsDeg[idx] ?? 0)) * (Math.PI / 180);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const innerR = solveRayShapeDistance(cx, cy, cos, sin, inner, innerPoly);
    const outerR = solveRayShapeDistance(cx, cy, cos, sin, outer, outerPoly);
    if (innerR === null || outerR === null || outerR <= innerR + 1) {
      return { label, angle_deg: angle, inner_xy: [cx, cy] as [number, number], outer_xy: [cx, cy] as [number, number], thickness_mm: null };
    }
    const adjustedInnerR = Math.min(outerR - 1, Math.max(0, innerR + Math.max(0, innerGapPx)));
    const adjustedOuterR = Math.max(
      adjustedInnerR + 1,
      outerR - Math.max(0, outerGapPx) + (thicknessDeltaPx[idx] ?? 0),
    );
    const ix = cx + cos * adjustedInnerR;
    const iy = cy + sin * adjustedInnerR;
    const ox = cx + cos * adjustedOuterR;
    const oy = cy + sin * adjustedOuterR;
    const thickPx = adjustedOuterR - adjustedInnerR;
    return {
      label,
      angle_deg: angle,
      inner_xy: [ix, iy] as [number, number],
      outer_xy: [ox, oy] as [number, number],
      thickness_mm: thickPx * mmPerPx,
    };
  });
}

function solveRayShapeDistance(
  px: number,
  py: number,
  cos: number,
  sin: number,
  circle: Circle,
  polygon: Array<{ x: number; y: number }> | null,
) {
  if (!polygon || polygon.length < 3) {
    return solveRayCircleLocal(px, py, cos, sin, circle);
  }
  const t = solveRayPolygonLocal(px, py, cos, sin, polygon);
  if (t !== null) return t;
  return solveRayCircleLocal(px, py, cos, sin, circle);
}

function solveRayCircleLocal(
  px: number,
  py: number,
  cos: number,
  sin: number,
  c: Circle,
) {
  const dx = px - c.cx;
  const dy = py - c.cy;
  const B = 2 * (dx * cos + dy * sin);
  const C = dx * dx + dy * dy - c.r * c.r;
  const disc = B * B - 4 * C;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-B - sq) / 2;
  const t2 = (-B + sq) / 2;
  if (t1 > 1e-3) return t1;
  if (t2 > 1e-3) return t2;
  return null;
}

function solveRayPolygonLocal(
  px: number,
  py: number,
  cos: number,
  sin: number,
  polygon: Array<{ x: number; y: number }>,
) {
  let best: number | null = null;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const t = raySegmentIntersectionT(px, py, cos, sin, a.x, a.y, b.x, b.y);
    if (t === null) continue;
    if (best === null || t < best) best = t;
  }
  return best;
}

function raySegmentIntersectionT(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const ex = x2 - x1;
  const ey = y2 - y1;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return null;
  const qx = x1 - ox;
  const qy = y1 - oy;
  const t = (qx * ey - qy * ex) / den;
  const u = (qx * dy - qy * dx) / den;
  if (t <= 1e-3) return null;
  if (u < -1e-6 || u > 1 + 1e-6) return null;
  return t;
}

function normalizeDeg(deg: number) {
  let next = deg % 360;
  if (next < 0) next += 360;
  return next;
}

function drawInnerShape(
  ctx: CanvasRenderingContext2D,
  c: Circle,
  scale: number,
  shape: InnerShapeConfig,
  color: string,
  lineWidth: number,
  selectedPointIndex: number | null,
  selectedEdgeIndexes: number[],
) {
  const cx = c.cx * scale;
  const cy = c.cy * scale;
  const polygonPoints = getPolygonPoints(c, shape);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;

  if (shape.mode === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, c.r * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (shape.mode === "polygon") {
    for (let i = 0; i < polygonPoints.length; i += 1) {
      const j = (i + 1) % polygonPoints.length;
      const x1 = polygonPoints[i].x * scale;
      const y1 = polygonPoints[i].y * scale;
      const x2 = polygonPoints[j].x * scale;
      const y2 = polygonPoints[j].y * scale;
      ctx.beginPath();
      ctx.strokeStyle = selectedEdgeIndexes.includes(i) ? "#22d3ee" : color;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    for (let i = 0; i < polygonPoints.length; i += 1) {
      const x = polygonPoints[i].x * scale;
      const y = polygonPoints[i].y * scale;
      ctx.beginPath();
      ctx.fillStyle = i === selectedPointIndex ? "#22d3ee" : color;
      ctx.arc(x, y, i === selectedPointIndex ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Fallback, currently unused because only circle/polygon modes are available.
  ctx.beginPath();
  ctx.arc(cx, cy, c.r * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function ensurePointOffsets(shape: InnerShapeConfig): InnerShapeConfig {
  const points = Math.max(3, Math.round(shape.sides));
  const current = shape.pointOffsets ?? [];
  if (current.length === points) return shape;
  const next = Array.from({ length: points }, (_, i) => current[i] ?? { dx: 0, dy: 0 });
  return { ...shape, pointOffsets: next };
}

/** Diameter chord through ring centre at angleDeg, clamped to circle/polygon edge. */
function diameterLineThroughRing(
  ring: Circle,
  shape: InnerShapeConfig,
  angleDeg: number,
): DiameterLine {
  const poly = shape.mode === "polygon" ? getPolygonPoints(ring, shape) : null;
  const edgeDist = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const t = solveRayShapeDistance(ring.cx, ring.cy, cos, sin, ring, poly);
    return t !== null && t > 1 ? t : ring.r;
  };
  const a1 = angleDeg;
  const a2 = angleDeg + 180;
  const r1 = edgeDist(a1);
  const r2 = edgeDist(a2);
  const rad1 = (a1 * Math.PI) / 180;
  const rad2 = (a2 * Math.PI) / 180;
  return {
    x1: ring.cx + Math.cos(rad2) * r2,
    y1: ring.cy + Math.sin(rad2) * r2,
    x2: ring.cx + Math.cos(rad1) * r1,
    y2: ring.cy + Math.sin(rad1) * r1,
  };
}

function getPolygonPoints(c: Circle, shape: InnerShapeConfig) {
  const fixed = ensurePointOffsets(shape);
  const points = Math.max(3, Math.round(fixed.sides));
  const rotation = (fixed.rotationDeg * Math.PI) / 180;
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points; i += 1) {
    const t = rotation + (i / points) * Math.PI * 2;
    const baseX = c.cx + Math.cos(t) * c.r;
    const baseY = c.cy + Math.sin(t) * c.r;
    const off = fixed.pointOffsets[i] ?? { dx: 0, dy: 0 };
    out.push({ x: baseX + off.dx, y: baseY + off.dy });
  }
  return out;
}

function findPolygonEdgeNearPoint(
  px: number,
  py: number,
  points: Array<{ x: number; y: number }>,
  tolerance: number,
) {
  if (points.length < 2) return -1;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (distanceToSegment(px, py, a.x, a.y, b.x, b.y) <= tolerance) {
      return i;
    }
  }
  return -1;
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function findDiameterLineHandleOrSegment(px: number, py: number, lines: DiameterLine[]) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (insideHandle(px, py, line.x1, line.y1) || insideHandle(px, py, line.x2, line.y2)) {
      return i;
    }
    if (distanceToSegment(px, py, line.x1, line.y1, line.x2, line.y2) <= 8) {
      return i;
    }
  }
  return null;
}

function edgeSelectionToVertexIndexes(edgeIndexes: number[], sideCount: number) {
  const set = new Set<number>();
  edgeIndexes.forEach((idx) => {
    if (idx < 0 || idx >= sideCount) return;
    set.add(idx);
    set.add((idx + 1) % sideCount);
  });
  return [...set];
}

function drawGridAndRulers(ctx: CanvasRenderingContext2D, width: number, height: number, scale: number) {
  const step = Math.max(8, GRID_STEP_PX * scale);
  const majorStep = step * GRID_MAJOR_EVERY;

  ctx.save();

  // Grid (minor + major)
  for (let x = 0; x <= width; x += step) {
    const major = Math.round(x / step) % GRID_MAJOR_EVERY === 0;
    ctx.beginPath();
    ctx.strokeStyle = major ? "rgba(148,163,184,0.30)" : "rgba(148,163,184,0.14)";
    ctx.lineWidth = 1;
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += step) {
    const major = Math.round(y / step) % GRID_MAJOR_EVERY === 0;
    ctx.beginPath();
    ctx.strokeStyle = major ? "rgba(148,163,184,0.30)" : "rgba(148,163,184,0.14)";
    ctx.lineWidth = 1;
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
    ctx.stroke();
  }

  // Ruler bands
  ctx.fillStyle = "rgba(2,6,23,0.72)";
  ctx.fillRect(0, 0, width, 18);
  ctx.fillRect(0, 0, 18, height);

  // Ruler ticks and labels (top and left)
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(226,232,240,0.92)";
  ctx.strokeStyle = "rgba(148,163,184,0.70)";

  for (let x = 0; x <= width; x += step) {
    const index = Math.round(x / step);
    const major = index % GRID_MAJOR_EVERY === 0;
    const tickH = major ? 10 : 5;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 18);
    ctx.lineTo(Math.round(x) + 0.5, 18 - tickH);
    ctx.stroke();
    if (major) {
      ctx.fillText(`${Math.round(x / scale)}`, x + 2, 2);
    }
  }

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = 0; y <= height; y += step) {
    const index = Math.round(y / step);
    const major = index % GRID_MAJOR_EVERY === 0;
    const tickW = major ? 10 : 5;
    ctx.beginPath();
    ctx.moveTo(18, Math.round(y) + 0.5);
    ctx.lineTo(18 - tickW, Math.round(y) + 0.5);
    ctx.stroke();
    if (major) {
      ctx.fillText(`${Math.round(y / scale)}`, 15, y);
    }
  }

  // Corner square where rulers meet
  ctx.fillStyle = "rgba(15,23,42,0.85)";
  ctx.fillRect(0, 0, 18, 18);

  // Major ruler guides
  ctx.strokeStyle = "rgba(148,163,184,0.45)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += majorStep) {
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 18);
    ctx.lineTo(Math.round(x) + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += majorStep) {
    ctx.beginPath();
    ctx.moveTo(18, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
    ctx.stroke();
  }

  ctx.restore();
}

// Keep T_LABELS export so callers can render the same label list
export { T_LABELS, computeThicknessPairs };
