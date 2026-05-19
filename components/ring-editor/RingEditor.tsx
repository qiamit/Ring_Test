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

export type EditMode = "inner" | "outer" | "diam" | "thick" | "view";
type InnerShapeMode = "circle" | "polygon";

interface Style {
  inner: { color: string; width: number };
  outer: { color: string; width: number };
  diam: { color: string; width: number };
  thick: { color: string; width: number };
}

const DEFAULT_STYLE: Style = {
  inner: { color: "#fde047", width: 2 },
  outer: { color: "#f472b6", width: 2 },
  diam: { color: "#fb923c", width: 2 },
  thick: { color: "#4ade80", width: 2 },
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
  onResult?: (result: RingResult | null) => void;
  /** Notifies the parent of the canvas state so it can be persisted on save. */
  onStateChange?: (state: {
    inner: Circle | null;
    outer: Circle | null;
    diam: DiameterBox | null;
  }) => void;
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
}

type DragHandle =
  | { kind: "move"; ring: "inner" | "outer" | "diam" }
  | { kind: "resize"; ring: "inner" | "outer" }
  | { kind: "poly-point"; index: number }
  | { kind: "poly-edge"; ring: "inner" | "outer"; indices: number[] }
  | { kind: "diam-point"; point: "start" | "end"; lineIndex: number }
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
    onMetricsChange,
    cameraOn = false,
    cameraVideoRef,
    onDeleteImage,
    extraControls,
    saveControl,
    snapshotRef,
    onImageReplace,
  } = props;
  const style = { ...DEFAULT_STYLE, ...(props.style ?? {}) };

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imgReady, setImgReady] = useState(false);

  const [mode, setMode] = useState<EditMode>("view");
  const [inner, setInner] = useState<Circle | null>(null);
  const [outer, setOuter] = useState<Circle | null>(null);
  const [diam, setDiam] = useState<DiameterBox | null>(null);
  const [diamLine, setDiamLine] = useState<DiameterLine | null>(null);
  const [diamLines, setDiamLines] = useState<DiameterLine[]>([]);
  const [selectedDiamLine, setSelectedDiamLine] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [imageFilter, setImageFilter] = useState<ImageFilter>(DEFAULT_IMAGE_FILTER);
  const imageFilterUndoRef = useRef<ImageFilter[]>([]);
  const imageFilterRedoRef = useRef<ImageFilter[]>([]);
  const [innerShape, setInnerShape] = useState<InnerShapeConfig>(DEFAULT_INNER_SHAPE);
  const [outerShape, setOuterShape] = useState<InnerShapeConfig>(DEFAULT_INNER_SHAPE);
  const [isInnerAdjustOpen, setIsInnerAdjustOpen] = useState(false);
  const [isOuterAdjustOpen, setIsOuterAdjustOpen] = useState(false);
  const [isDiamAdjustOpen, setIsDiamAdjustOpen] = useState(false);
  const [isThicknessAdjustOpen, setIsThicknessAdjustOpen] = useState(false);
  const [selectedPolyPoint, setSelectedPolyPoint] = useState<number | null>(null);
  const [selectedOuterPolyPoint, setSelectedOuterPolyPoint] = useState<number | null>(null);
  const [selectedPolyEdges, setSelectedPolyEdges] = useState<number[]>([]);
  const [selectedOuterPolyEdges, setSelectedOuterPolyEdges] = useState<number[]>([]);
  const [selectedThicknessKey, setSelectedThicknessKey] = useState<"none" | "all" | number>("none");
  const [thicknessAngleOffsetsDeg, setThicknessAngleOffsetsDeg] = useState<number[]>(
    Array.from({ length: 8 }, () => 0),
  );
  const [thicknessDeltaPx, setThicknessDeltaPx] = useState<number[]>(
    Array.from({ length: 8 }, () => 0),
  );

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

  // Compute mm/px from sample diameter and the diameter box (or override)
  const mmPerPx = useMemo(() => {
    const referenceLine =
      diamLine ??
      (selectedDiamLine !== null ? diamLines[selectedDiamLine] : diamLines[diamLines.length - 1] ?? null);
    if (mmPerPxOverride && mmPerPxOverride > 0) return mmPerPxOverride;
    if (sampleDiameterMm && sampleDiameterMm > 0 && referenceLine) {
      const lengthPx = Math.hypot(referenceLine.x2 - referenceLine.x1, referenceLine.y2 - referenceLine.y1);
      if (lengthPx > 0) return sampleDiameterMm / lengthPx;
    }
    if (sampleDiameterMm && sampleDiameterMm > 0 && diam) {
      const widthMean = (diam.w + diam.h) / 2;
      if (widthMean > 0) return sampleDiameterMm / widthMean;
    }
    return 0;
  }, [mmPerPxOverride, sampleDiameterMm, diamLine, selectedDiamLine, diamLines, diam]);

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

  // When a new image is loaded, start with no guides.
  useEffect(() => {
    if (!imageSrc) {
      setInner(null);
      setOuter(null);
      setDiam(null);
      setDiamLine(null);
      setDiamLines([]);
      setSelectedDiamLine(null);
      setIsInnerAdjustOpen(false);
      setIsOuterAdjustOpen(false);
      setIsDiamAdjustOpen(false);
      setIsThicknessAdjustOpen(false);
      setSelectedPolyPoint(null);
      setSelectedOuterPolyPoint(null);
      setSelectedPolyEdges([]);
      setSelectedOuterPolyEdges([]);
      setSelectedThicknessKey("none");
      setThicknessAngleOffsetsDeg(Array.from({ length: 8 }, () => 0));
      setThicknessDeltaPx(Array.from({ length: 8 }, () => 0));
      return;
    }
    setInner(null);
    setOuter(null);
    setDiam(null);
    setDiamLine(null);
    setDiamLines([]);
    setSelectedDiamLine(null);
    setIsInnerAdjustOpen(false);
    setIsOuterAdjustOpen(false);
    setIsDiamAdjustOpen(false);
    setIsThicknessAdjustOpen(false);
    setSelectedPolyPoint(null);
    setSelectedOuterPolyPoint(null);
    setSelectedPolyEdges([]);
    setSelectedOuterPolyEdges([]);
    setSelectedThicknessKey("none");
    setThicknessAngleOffsetsDeg(Array.from({ length: 8 }, () => 0));
    setThicknessDeltaPx(Array.from({ length: 8 }, () => 0));
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
      thicknessEnabled: isThicknessAdjustOpen || mode === "thick",
    });
  }, [mmPerPx, effectiveResult, onMetricsChange, inner, outer, diamLines, isThicknessAdjustOpen, mode]);

  // Compute display scale to fit the fixed 200mm x 200mm viewport.
  const updateScale = useCallback(() => {
    if (!containerRef.current || !imageWidth || !imageHeight) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const maxW = Math.max(cw - 4, 1);
    const maxH = Math.max(ch - 4, 1);
    const s = Math.min(maxW / imageWidth, maxH / imageHeight);
    setScale(Math.min(5, Math.max(0.1, s)));
  }, [imageWidth, imageHeight]);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(0.1, prev * 0.9));
  }, []);

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(5, prev * 1.1));
  }, []);

  useEffect(() => {
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [updateScale]);

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

    // Thickness markers + labels
    if (thicknessPairsDisplay.length > 0 && (mode === "thick" || isThicknessAdjustOpen)) {
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
  }, [imgReady, imageWidth, imageHeight, scale, inner, innerShape, outer, outerShape, diam, diamLine, diamLines, selectedDiamLine, mode, result, style, selectedPolyPoint, selectedOuterPolyPoint, selectedPolyEdges, selectedOuterPolyEdges, mmPerPx, thicknessPairsDisplay, isThicknessAdjustOpen, imageFilter]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      canvasRef.current.setPointerCapture(e.pointerId);
      const { x, y } = pointerImageCoords(e, canvasRef.current, scale);
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
    [mode, inner, outer, diam, diamLine, diamLines, scale, innerShape, outerShape, selectedPolyEdges, selectedOuterPolyEdges],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      const { x, y } = pointerImageCoords(e, canvasRef.current, scale);
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
  }, [diamLine]);

  const resetCircles = useCallback(() => {
    if (!imageWidth || !imageHeight) return;
    const s = suggestInitialCircles(imageWidth, imageHeight);
    setInner(s.inner);
    setOuter(s.outer);
    setDiam(s.diam);
  }, [imageWidth, imageHeight]);

  const openInnerAdjust = useCallback(() => {
    if (!inner && imageWidth > 0 && imageHeight > 0) {
      const s = suggestInitialCircles(imageWidth, imageHeight);
      setInner(s.inner);
    }
    setMode("inner");
    setIsInnerAdjustOpen(true);
    setIsOuterAdjustOpen(false);
    setInnerShape((prev) => ensurePointOffsets(prev));
  }, [inner, imageWidth, imageHeight]);

  const openOuterAdjust = useCallback(() => {
    if (!outer && imageWidth > 0 && imageHeight > 0) {
      const s = suggestInitialCircles(imageWidth, imageHeight);
      setOuter(s.outer);
    }
    setMode("outer");
    setIsOuterAdjustOpen(true);
    setIsInnerAdjustOpen(false);
    setOuterShape((prev) => ensurePointOffsets(prev));
  }, [outer, imageWidth, imageHeight]);

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
    if (mode === "inner") setMode("view");
  }, [mode]);
  const deleteOuterRing = useCallback(() => {
    setOuter(null);
    setOuterShape(DEFAULT_INNER_SHAPE);
    setIsOuterAdjustOpen(false);
    setSelectedOuterPolyPoint(null);
    setSelectedOuterPolyEdges([]);
    if (mode === "outer") setMode("view");
  }, [mode]);

  const activateDiameterMode = useCallback(() => {
    setMode("diam");
    setIsDiamAdjustOpen(true);
    setIsInnerAdjustOpen(false);
    setIsOuterAdjustOpen(false);
    setIsThicknessAdjustOpen(false);
  }, []);
  const openThicknessAdjust = useCallback(() => {
    if (!inner || !outer) return;
    setMode("thick");
    setIsThicknessAdjustOpen(true);
    setIsInnerAdjustOpen(false);
    setIsOuterAdjustOpen(false);
    setIsDiamAdjustOpen(false);
  }, [inner, outer]);
  const deleteSelectedDiameterLine = useCallback(() => {
    if (selectedDiamLine === null) return;
    setDiamLines((prev) => {
      const next = prev.filter((_, idx) => idx !== selectedDiamLine);
      setSelectedDiamLine(next.length ? Math.min(selectedDiamLine, next.length - 1) : null);
      return next;
    });
  }, [selectedDiamLine]);
  const closeDiamAdjust = useCallback(() => {
    setIsDiamAdjustOpen(false);
  }, []);
  const closeThicknessAdjust = useCallback(() => {
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

  return (
      <div className="space-y-3">
      <div className="flex w-full flex-wrap items-center gap-2 [&>button]:flex-1 [&>button]:justify-center [&>button]:whitespace-nowrap [&>button]:px-3 [&>button]:py-2 [&>button]:text-center sm:[&>button]:min-w-[120px]">
        {extraControls}
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
      </div>
      <div className="relative flex w-full flex-col gap-3 pb-12 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex items-stretch gap-2">
            <div
              ref={containerRef}
              className="card-subtle relative aspect-square w-full min-w-0 max-h-[calc(100vh-180px)] max-w-[calc(100vh-180px)] flex-1 items-center justify-center overflow-auto"
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
              className="block touch-none select-none"
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onCanvasKeyDown}
            />
            </div>
            <div className="shrink-0 self-stretch rounded-xl border border-[--color-border-strong] bg-slate-900/85 p-2.5 max-h-full w-[170px] overflow-hidden shadow-lg shadow-black/20">
              <div className="mb-2 border-b border-[--color-border] pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                Image Adjust
              </div>
              <div className="h-[calc(100%-96px)] min-h-0 space-y-2 overflow-y-auto pr-1">
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
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-[--color-border] pt-2">
                <button
                  type="button"
                  onClick={undoImageFilter}
                  className="rounded-md border border-[--color-border-strong] px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={redoImageFilter}
                  className="rounded-md border border-[--color-border-strong] px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800"
                >
                  Redo
                </button>
                <button
                  type="button"
                  onClick={resetImageFilter}
                  className="col-span-2 rounded-md border border-[--color-border-strong] bg-slate-800/70 px-2 py-1 text-[10px] font-medium text-slate-100 hover:bg-slate-700"
                >
                  Reset All
                </button>
                <button
                  type="button"
                  onClick={() => rotateImage("left")}
                  className="rounded-md border border-[--color-border-strong] px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800"
                >
                  Rotate L
                </button>
                <button
                  type="button"
                  onClick={() => rotateImage("right")}
                  className="rounded-md border border-[--color-border-strong] px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800"
                >
                  Rotate R
                </button>
                <button
                  type="button"
                  onClick={() => flipImage("h")}
                  className="rounded-md border border-[--color-border-strong] px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800"
                >
                  Flip H
                </button>
                <button
                  type="button"
                  onClick={() => flipImage("v")}
                  className="rounded-md border border-[--color-border-strong] px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800"
                >
                  Flip V
                </button>
                <button
                  type="button"
                  onClick={cropCenter}
                  className="col-span-2 rounded-md border border-[--color-border-strong] px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800"
                >
                  Crop Center
                </button>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-full border border-[--color-border-strong] bg-slate-900/70 p-1">
              <button
                type="button"
                onClick={zoomOut}
                className="rounded-md border border-[--color-border-strong] px-2 py-1 text-xs text-slate-100 hover:bg-slate-800"
                title="Zoom Out"
                aria-label="Zoom Out"
              >
                ➖
              </button>
              <button
                type="button"
                onClick={zoomIn}
                className="rounded-md border border-[--color-border-strong] px-2 py-1 text-xs text-slate-100 hover:bg-slate-800"
                title="Zoom In"
                aria-label="Zoom In"
              >
                ➕
              </button>
              <button
                type="button"
                onClick={onDeleteImage}
                disabled={!imageSrc}
                className="rounded-md border border-red-400/70 bg-red-500/20 px-2 py-1 text-xs text-red-200 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                title="Delete image"
                aria-label="Delete image"
              >
                🗑️
              </button>
            </div>
            {saveControl}
          </div>
        </div>
        {isInnerAdjustOpen || isOuterAdjustOpen || isDiamAdjustOpen || isThicknessAdjustOpen ? (
          <div className="card-subtle w-full space-y-3 rounded-xl p-3 text-center sm:w-[320px] xl:w-[10vw]">
            <div className="flex items-center justify-center">
              <h3 className="text-sm font-semibold text-white">
                {mode === "diam"
                  ? "Adjust Diameter"
                  : mode === "thick"
                    ? "Adjust Thickness Points"
                    : mode === "outer"
                      ? "Adjust Outer Ring"
                      : "Adjust Inner Ring"}
              </h3>
            </div>
            {mode === "diam" ? (
              <>
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
                </div>
              </>
            ) : (
              <>

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
          ? "inline-flex items-center gap-2 rounded-lg border border-[--color-border-strong] bg-slate-900/40 px-3 py-1.5 text-sm font-medium text-slate-500"
          : active
          ? "inline-flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm font-semibold text-white"
          : "inline-flex items-center gap-2 rounded-lg border border-[--color-border-strong] bg-slate-800/50 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-700"
      }
      style={!disabled && active ? { borderColor: color, background: `${color}22` } : undefined}
    >
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-full"
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
    <label className="block rounded-md border border-[--color-border] bg-slate-900/40 px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between text-[10px] text-slate-300">
        <span>{label}</span>
        <span className="font-mono text-slate-400">{value}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-blue-400"
        aria-label={label}
      />
    </label>
  );
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
