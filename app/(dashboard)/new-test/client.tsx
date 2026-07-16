"use client";

import { Camera, Loader2, Save, Upload, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";

import {
  RingEditor,
  type RingEditorToolbarApi,
  type RingEditorToolbarState,
} from "@/components/ring-editor/RingEditor";
import type { Circle, DiameterBox, RingResult } from "@/lib/analysis";
import type { AnalysisResults } from "@/lib/firebase/types";
import {
  clearNewTestDraft,
  loadNewTestDraft,
  saveNewTestDraft,
  type EditorGeometryDraft,
} from "@/lib/new-test-draft";
import { todayIso, timeNowHHMM } from "@/lib/utils";

import { saveTest } from "./actions";

interface Style {
  inner: { color: string; width: number };
  outer: { color: string; width: number };
  diam: { color: string; width: number };
  thick: { color: string; width: number };
}

interface Defaults {
  mmPerPxOverride: number | null;
  angularCorrectionDeg: number;
  thicknessOuterGapPx: number;
  thicknessInnerGapPx: number;
  units: string;
  style?: Partial<Style>;
  aiAnalysisEnabled?: boolean;
}

export function NewTestClient({ defaults }: { defaults: Defaults }) {
  const [draftReady, setDraftReady] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imgDim, setImgDim] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const [sampleDescription, setSampleDescription] = useState("");
  const [sampleDiameter, setSampleDiameter] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [mfgDate, setMfgDate] = useState("");
  const [testerName, setTesterName] = useState("");
  const [testDate, setTestDate] = useState(todayIso());
  const [testTime, setTestTime] = useState(timeNowHHMM());
  const [observations, setObservations] = useState("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [operatorNameInput, setOperatorNameInput] = useState("");
  const [observationInput, setObservationInput] = useState("");

  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisMounted, setAnalysisMounted] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);

  const [result, setResult] = useState<RingResult | null>(null);
  const [geometry, setGeometry] = useState<EditorGeometryDraft | null>(null);
  const [editorMetrics, setEditorMetrics] = useState<{
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
  }>({
    mmPerPx: 0,
    thicknessMean: null,
    thicknessPoints: 0,
    fpAreaPx2: null,
    tmAreaPx2: null,
    totalAreaPx2: null,
    tmAreaPercent: null,
    diameterLineCount: 0,
    diameterSinglePx: null,
    diameterAveragePx: null,
    diameterSingleMm: null,
    diameterAverageMm: null,
    thicknessEnabled: false,
  });
  const [editorState, setEditorState] = useState<{
    inner: Circle | null;
    outer: Circle | null;
    diam: DiameterBox | null;
  }>({ inner: null, outer: null, diam: null });

  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const editorSnapshotRef = useRef<(() => string | null) | null>(null);
  const editorToolbarApiRef = useRef<RingEditorToolbarApi | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [editorToolbar, setEditorToolbar] = useState<RingEditorToolbarState>({
    detectingAi: false,
    aiStatus: null,
    mmpxActive: false,
    imgReady: false,
    aiAnalysisEnabled: defaults.aiAnalysisEnabled === true,
  });
  const [cameraOn, setCameraOn] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  useLayoutEffect(() => {
    const draft = loadNewTestDraft();
    if (draft) {
      setImageSrc(draft.imageSrc);
      setImgDim(draft.imgDim);
      setSampleDescription(draft.sampleDescription);
      setSampleDiameter(draft.sampleDiameter);
      setBatchNumber(draft.batchNumber);
      setMfgDate(draft.mfgDate);
      setTesterName(draft.testerName);
      setTestDate(draft.testDate || todayIso());
      setTestTime(draft.testTime || timeNowHHMM());
      setObservations(draft.observations);
      setGeometry(draft.geometry);
      setResult(draft.result);
      setEditorState({
        inner: draft.geometry?.inner ?? null,
        outer: draft.geometry?.outer ?? null,
        diam: draft.geometry?.diam ?? null,
      });
      if (draft.imageSrc || draft.geometry) {
        setAnalysisMounted(true);
      }
    }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    saveNewTestDraft({
      imageSrc,
      imgDim,
      sampleDescription,
      sampleDiameter,
      batchNumber,
      mfgDate,
      testerName,
      testDate,
      testTime,
      observations,
      geometry,
      result,
    });
  }, [
    draftReady,
    imageSrc,
    imgDim,
    sampleDescription,
    sampleDiameter,
    batchNumber,
    mfgDate,
    testerName,
    testDate,
    testTime,
    observations,
    geometry,
    result,
  ]);

  const handleFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const targetW = 590;
      const targetH = 590;
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        setToast({ kind: "err", text: "Could not process image for upload." });
        return;
      }
      ctx.drawImage(im, 0, 0, targetW, targetH);
      const resizedUrl = canvas.toDataURL("image/png");
      URL.revokeObjectURL(url);
      setImgDim({ w: targetW, h: targetH });
      setImageSrc(resizedUrl);
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      setToast({ kind: "err", text: "Invalid image file." });
    };
    im.src = url;
  }, []);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const startCamera = useCallback(async () => {
    if (cameraOn) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch (err) {
      setToast({ kind: "err", text: `Camera access denied: ${(err as Error).message}` });
    }
  }, [cameraOn]);

  useEffect(() => {
    if (!cameraOn || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {});
  }, [cameraOn]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const validateSampleInfo = useCallback(() => {
    if (!sampleDescription.trim()) return "Enter Sample Description.";
    if (!sampleDiameter || Number(sampleDiameter) <= 0) return "Enter a valid Sample Diameter (mm).";
    if (!batchNumber.trim()) return "Enter Batch Number.";
    if (!mfgDate) return "Select MFG Date.";
    return null;
  }, [sampleDescription, sampleDiameter, batchNumber, mfgDate]);

  const captureFromCamera = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 1280;
    canvas.height = v.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/png");
    setImgDim({ w: canvas.width, h: canvas.height });
    setImageSrc(url);
    stopCamera();
  }, [stopCamera]);

  const onSave = useCallback(async (overrides?: { testerName?: string; observations?: string }) => {
    const effectiveTesterName = (overrides?.testerName ?? testerName).trim();
    const effectiveObservations = (overrides?.observations ?? observations).trim();
    if (!imageSrc || !result || !editorState.inner || !editorState.outer) {
      setToast({ kind: "err", text: "Place inner and outer rings, then enter sample diameter." });
      return;
    }
    const sampleError = validateSampleInfo();
    if (sampleError) {
      setToast({ kind: "err", text: sampleError });
      return;
    }
    const annotated = editorSnapshotRef.current?.() ?? null;
    if (!annotated) {
      setToast({ kind: "err", text: "Could not capture editor screenshot. Please try again." });
      return;
    }

    const analysisResults: AnalysisResults = {
      sample_diameter_mm: Number(sampleDiameter),
      mm_per_px:
        editorMetrics.mmPerPx > 0
          ? editorMetrics.mmPerPx
          : defaults.mmPerPxOverride && defaults.mmPerPxOverride > 0
            ? defaults.mmPerPxOverride
            : 0,
      inner_circle: editorState.inner,
      outer_circle: editorState.outer,
      diameter_box: editorState.diam,
      thickness_measurements: result.thicknessPairs.map((p) => ({
        label: p.label,
        angle_deg: p.angle_deg,
        thickness_mm: p.thickness_mm,
        inner_xy: p.inner_xy,
        outer_xy: p.outer_xy,
      })),
      thickness_min_mm: result.thicknessMin,
      thickness_max_mm: result.thicknessMax,
      thickness_mean_mm: result.thicknessMean,
      thickness_in_range: result.thicknessInRange,
      thickness_range_low_mm: result.thicknessLow,
      thickness_range_high_mm: result.thicknessHigh,
      area_tm_mm2: result.areaTM,
      area_fp_mm2: result.areaFP,
      tm_area_fraction_percent: result.tmShare,
      tm_area_share_in_range: result.tmShareInRange,
      overall_pass: result.overallPass,
      observations: effectiveObservations,
    };

    startTransition(async () => {
      const res = await saveTest({
        sample_description: sampleDescription,
        sample_diameter_mm: Number(sampleDiameter),
        batch_number: batchNumber,
        mfg_date: mfgDate,
        tester_name: effectiveTesterName,
        test_date: testDate,
        test_time: testTime,
        observations: effectiveObservations,
        results: analysisResults,
        imageDataUrl: annotated,
      });
      if (res.ok) {
        setToast({ kind: "ok", text: "Saved to your account." });
        clearNewTestDraft();
        setImageSrc(null);
        setImgDim({ w: 0, h: 0 });
        setResult(null);
        setGeometry(null);
        setEditorState({ inner: null, outer: null, diam: null });
        setSampleDescription("");
        setSampleDiameter("");
        setBatchNumber("");
        setMfgDate("");
        setObservations("");
        setTestDate(todayIso());
        setTestTime(timeNowHHMM());
        setEditorKey((k) => k + 1);
        setResultsOpen(false);
        setAnalysisOpen(false);
        setAnalysisMounted(false);
      } else {
        setToast({ kind: "err", text: res.error });
      }
    });
  }, [
    imageSrc,
    result,
    editorState,
    sampleDescription,
    sampleDiameter,
    batchNumber,
    mfgDate,
    testerName,
    testDate,
    testTime,
    observations,
    defaults,
    editorMetrics.mmPerPx,
    validateSampleInfo,
  ]);

  const deleteImage = useCallback(() => {
    stopCamera();
    setImageSrc(null);
    setImgDim({ w: 0, h: 0 });
    setResult(null);
    setGeometry(null);
    setEditorState({ inner: null, outer: null, diam: null });
    setEditorKey((k) => k + 1);
  }, [stopCamera]);

  const openSaveDialog = useCallback(() => {
    setOperatorNameInput(testerName);
    setObservationInput(observations);
    setSaveDialogOpen(true);
  }, [testerName, observations]);

  const confirmSaveFromDialog = useCallback(async () => {
    await onSave({ testerName: operatorNameInput, observations: observationInput });
    setTesterName(operatorNameInput.trim());
    setObservations(observationInput.trim());
    setSaveDialogOpen(false);
  }, [onSave, operatorNameInput, observationInput]);

  const openAnalysis = useCallback(() => {
    const sampleError = validateSampleInfo();
    if (sampleError) {
      setToast({ kind: "err", text: `${sampleError} before analysis.` });
      return;
    }
    setAnalysisMounted(true);
    setAnalysisOpen(true);
    setToast(null);
  }, [validateSampleInfo]);

  const closeAnalysis = useCallback(() => {
    stopCamera();
    setResultsOpen(false);
    setAnalysisOpen(false);
  }, [stopCamera]);

  const verdictReady = !!result && editorMetrics.thicknessEnabled;
  const verdictLabel = !verdictReady ? "IN-PROGRESS" : result.overallPass ? "PASS" : "FAIL";
  const verdictClass = !verdictReady
    ? "pill-neutral"
    : result.overallPass
      ? "pill-pass"
      : "pill-fail";

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileInput}
      />

      {toast ? (
        <div
          className={
            toast.kind === "ok"
              ? "rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300"
              : "rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          }
        >
          {toast.text}
        </div>
      ) : null}

      {/* Step 1 — Sample Information + testing slogan */}
      <div className="grid min-h-[calc(100dvh-5.5rem)] gap-4 lg:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)] lg:items-stretch">
        <div className="card h-fit space-y-4 p-4 sm:p-5 lg:sticky lg:top-0">
          <h2 className="text-base font-semibold text-white">Sample Information</h2>
          <Field label="Sample Description" required>
            <input
              value={sampleDescription}
              onChange={(e) => setSampleDescription(e.target.value)}
              className="input"
              placeholder="e.g. TMT ring specimen"
              required
            />
          </Field>
          <Field label="Sample Diameter in mm" required>
            <input
              type="number"
              step="0.01"
              value={sampleDiameter}
              onChange={(e) => setSampleDiameter(e.target.value)}
              className="input"
              placeholder="e.g. 12"
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Batch Number" required>
              <input
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                className="input"
                placeholder="e.g. B-001"
                required
              />
            </Field>
            <Field label="MFG Date" required>
              <input
                type="date"
                value={mfgDate}
                onChange={(e) => setMfgDate(e.target.value)}
                className="input"
                required
              />
            </Field>
          </div>
          <button type="button" className="btn-primary w-full" onClick={openAnalysis}>
            Do Analysis
          </button>
          <p className="border-t border-[--color-border] pt-3 text-center text-xs leading-relaxed text-[--color-muted] lg:hidden">
            <span className="font-medium text-slate-300">Measure once. Trust every millimetre.</span>
            <span className="mt-1 block">IS 1786:2008 ring testing — capture, analyse, report.</span>
          </p>
        </div>

        <aside className="relative hidden overflow-hidden rounded-[--radius-card] border border-[--color-border] bg-[#070d18] lg:flex lg:min-h-0 lg:flex-col">
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-600/15 via-transparent to-cyan-500/10"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl motion-safe:animate-pulse"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -left-16 bottom-8 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.045]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
            aria-hidden
          />

          <div className="relative flex flex-1 flex-col justify-center px-8 py-10 xl:px-12 xl:py-12">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300/90">
              Ring Test Manager
            </p>
            <h2 className="mt-4 max-w-xl text-3xl font-bold tracking-tight text-white xl:text-4xl xl:leading-tight">
              Measure once.
              <span className="block text-slate-200">Trust every millimetre.</span>
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-400 xl:text-base">
              From specimen face to IS 1786:2008 verdict — capture, scale, analyse thickness, and
              leave a report you can stand behind.
            </p>

            <div className="relative mt-10 h-40 w-40 xl:mt-12 xl:h-48 xl:w-48" aria-hidden>
              <div className="absolute inset-0 rounded-full border border-blue-400/25" />
              <div className="absolute inset-[14%] rounded-full border border-cyan-300/30 motion-safe:animate-[spin_28s_linear_infinite]" />
              <div className="absolute inset-[28%] rounded-full border border-dashed border-white/20" />
              <div className="absolute inset-[42%] rounded-full bg-gradient-to-br from-blue-500/30 to-cyan-400/10" />
              <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-300 shadow-[0_0_16px_rgba(96,165,250,0.7)]" />
            </div>

            <p className="mt-8 text-xs tracking-wide text-slate-500">
              Fill sample details, then continue with{" "}
              <span className="font-medium text-slate-300">Do Analysis</span>.
            </p>
          </div>
        </aside>
      </div>

      {/* Step 2 — Analysis window (RingEditor) */}
      {analysisMounted && draftReady ? (
        <div
          className={
            analysisOpen
              ? "fixed inset-0 z-40 flex flex-col bg-slate-950"
              : "hidden"
          }
          aria-hidden={!analysisOpen}
        >
          <header className="flex shrink-0 flex-col gap-2 border-b border-[--color-border] px-2 py-2 sm:flex-row sm:items-center sm:gap-2 sm:overflow-x-auto sm:px-4">
            <h2 className="shrink-0 text-sm font-semibold whitespace-nowrap text-white">
              Do Analysis
            </h2>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:ml-auto sm:flex-nowrap sm:gap-2">
              <button
                type="button"
                className="btn-secondary shrink-0 px-2.5 text-xs sm:px-3 sm:text-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} />
                Upload
              </button>
              {!cameraOn ? (
                <button
                  type="button"
                  className="btn-secondary shrink-0 px-2.5 text-xs sm:px-3 sm:text-sm"
                  onClick={startCamera}
                >
                  <Camera size={14} />
                  Camera
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-primary shrink-0 px-2.5 text-xs sm:px-3 sm:text-sm"
                    onClick={captureFromCamera}
                  >
                    <Camera size={14} />
                    Capture
                  </button>
                  <button
                    type="button"
                    className="btn-secondary shrink-0 px-2.5 text-xs sm:px-3 sm:text-sm"
                    onClick={stopCamera}
                  >
                    <X size={14} />
                    Stop
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => editorToolbarApiRef.current?.openMmpx()}
                className={
                  editorToolbar.mmpxActive
                    ? "btn-secondary shrink-0 px-2.5 text-xs ring-2 ring-cyan-400/70 sm:px-3 sm:text-sm"
                    : "btn-secondary shrink-0 px-2.5 text-xs sm:px-3 sm:text-sm"
                }
              >
                mm/px
              </button>
              {editorToolbar.aiAnalysisEnabled ? (
                <button
                  type="button"
                  onClick={() => editorToolbarApiRef.current?.runAiAnalysis()}
                  disabled={editorToolbar.detectingAi || !imageSrc || !editorToolbar.imgReady}
                  className={
                    editorToolbar.detectingAi
                      ? "btn-secondary shrink-0 px-2.5 text-xs ring-2 ring-violet-400/70 sm:px-3 sm:text-sm"
                      : "btn-secondary shrink-0 px-2.5 text-xs sm:px-3 sm:text-sm"
                  }
                  title={editorToolbar.aiStatus ?? undefined}
                  aria-label={editorToolbar.detectingAi ? "AI Analyzing" : "AI Analysis"}
                >
                  {editorToolbar.detectingAi ? "AI…" : "AI"}
                </button>
              ) : null}
              <button
                type="button"
                className="btn-primary shrink-0 px-2.5 text-xs sm:px-3 sm:text-sm"
                onClick={() => setResultsOpen(true)}
              >
                Result
              </button>
              <button
                type="button"
                className="btn-secondary shrink-0 px-2.5 text-xs sm:px-3 sm:text-sm"
                onClick={closeAnalysis}
              >
                <X size={14} />
                Close
              </button>
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-3">
            <RingEditor
              key={editorKey}
              imageSrc={imageSrc}
              imageWidth={imgDim.w}
              imageHeight={imgDim.h}
              sampleDiameterMm={sampleDiameter ? Number(sampleDiameter) : null}
              mmPerPxOverride={defaults.mmPerPxOverride}
              angularCorrectionDeg={defaults.angularCorrectionDeg}
              thicknessOuterGapPx={defaults.thicknessOuterGapPx}
              thicknessInnerGapPx={defaults.thicknessInnerGapPx}
              style={defaults.style}
              initialGeometry={geometry}
              onResult={setResult}
              onStateChange={setEditorState}
              onGeometryChange={setGeometry}
              onMetricsChange={setEditorMetrics}
              cameraOn={cameraOn}
              cameraVideoRef={videoRef}
              onDeleteImage={deleteImage}
              snapshotRef={editorSnapshotRef}
              onImageReplace={(nextImageSrc, dims) => {
                setImageSrc(nextImageSrc);
                setImgDim(dims);
              }}
              aiAnalysisEnabled={defaults.aiAnalysisEnabled === true}
              hideHeaderToolsInSidebar
              toolbarApiRef={editorToolbarApiRef}
              onToolbarStateChange={setEditorToolbar}
              canvasOverlay={
                <button
                  type="button"
                  className={`${verdictClass} pointer-events-auto cursor-pointer px-3 py-1.5 text-xs font-semibold shadow-lg`}
                  onClick={() => setResultsOpen(true)}
                  title="View analysis result"
                >
                  {verdictLabel}
                </button>
              }
            />
          </div>
        </div>
      ) : null}

      {/* Step 3 — Results window */}
      {resultsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6">
          <div className="flex max-h-[min(920px,100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[--color-border] bg-slate-950 shadow-2xl">
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[--color-border] px-4 py-3">
              <h2 className="text-sm font-semibold text-white sm:text-base">Analysis Results</h2>
              <button type="button" className="btn-ghost" onClick={() => setResultsOpen(false)}>
                <X size={14} />
                Close
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <ResultsPanel result={result} editorMetrics={editorMetrics} />
            </div>
            <footer className="flex shrink-0 justify-end gap-2 border-t border-[--color-border] px-4 py-3">
              <button type="button" className="btn-ghost" onClick={() => setResultsOpen(false)}>
                Back to Analysis
              </button>
              <button type="button" disabled={pending} className="btn-primary" onClick={openSaveDialog}>
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save Result
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {saveDialogOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-[--color-border] bg-slate-950 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Save Test Result</h3>
            <div className="space-y-3">
              <Field label="Operator Name">
                <input
                  value={operatorNameInput}
                  onChange={(e) => setOperatorNameInput(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Observation">
                <textarea
                  value={observationInput}
                  onChange={(e) => setObservationInput(e.target.value)}
                  className="input min-h-[84px]"
                />
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setSaveDialogOpen(false)} className="btn-ghost">
                Cancel
              </button>
              <button type="button" disabled={pending} onClick={confirmSaveFromDialog} className="btn-primary">
                {pending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label mb-1 block">
        {label}
        {required ? <span className="ml-1 text-red-300">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function ResultsPanel({
  result,
  editorMetrics,
}: {
  result: RingResult | null;
  editorMetrics: {
    mmPerPx: number;
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
  };
}) {
  const areaToMm2 = (areaPx2: number | null) =>
    areaPx2 !== null && editorMetrics.mmPerPx > 0 ? areaPx2 * editorMetrics.mmPerPx * editorMetrics.mmPerPx : null;
  const effectiveDiameterMm = editorMetrics.diameterAverageMm ?? editorMetrics.diameterSingleMm;
  const reqLowMm = effectiveDiameterMm !== null ? effectiveDiameterMm * 0.07 : null;
  const reqHighMm = effectiveDiameterMm !== null ? effectiveDiameterMm * 0.15 : null;
  const designationOrder = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
  const sortedPairs = result
    ? [...result.thicknessPairs].sort(
        (a, b) => designationOrder.indexOf(a.label.toLowerCase()) - designationOrder.indexOf(b.label.toLowerCase()),
      )
    : Array.from({ length: 8 }, (_, i) => ({ label: `t${i + 1}`, angle_deg: i * 45, thickness_mm: null }));
  const showThickness = !!result && editorMetrics.thicknessEnabled;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Analysis</h3>
        <span
          className={
            !result || !editorMetrics.thicknessEnabled
              ? "pill-neutral"
              : result.overallPass
                ? "pill-pass"
                : "pill-fail"
          }
        >
          {!result || !editorMetrics.thicknessEnabled ? "IN-PROGRESS" : result.overallPass ? "PASS" : "FAIL"}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-[--color-border] text-xs">
        <div className="grid grid-cols-[25%_25%_50%] bg-slate-800/60 text-center font-semibold text-slate-200">
          <div className="border-r border-[--color-border] p-2">Thickness Designation</div>
          <div className="border-r border-[--color-border] p-2">Results in mm</div>
          <div className="p-2"></div>
        </div>
        <div className="grid grid-cols-[25%_25%_50%]">
          <div className="border-r border-[--color-border]">
            {sortedPairs.map((p) => (
              <div key={p.label} className="border-t border-[--color-border] px-2 py-1 text-slate-200">
                {p.label.toUpperCase()}
              </div>
            ))}
          </div>
          <div className="border-r border-[--color-border]">
            {sortedPairs.map((p) => (
              <div key={`${p.label}-v`} className="border-t border-[--color-border] px-2 py-1 font-mono text-slate-100">
                {showThickness && p.thickness_mm !== null ? p.thickness_mm.toFixed(4) : "----"}
              </div>
            ))}
          </div>
          <div>
            <div className="border-t border-[--color-border] px-2 py-1">
              Minimum: {showThickness && result?.thicknessMin !== null ? result.thicknessMin.toFixed(4) : "----"}
            </div>
            <div className="border-t border-[--color-border] px-2 py-1">
              Maximum: {showThickness && result?.thicknessMax !== null ? result.thicknessMax.toFixed(4) : "----"}
            </div>
            <div className="border-t border-[--color-border] px-2 py-1">
              Average: {showThickness && result?.thicknessMean !== null ? result.thicknessMean.toFixed(4) : "----"}
            </div>
            <div className="border-t border-[--color-border] px-2 py-1">
              Total Area: {areaToMm2(editorMetrics.totalAreaPx2) !== null ? `${areaToMm2(editorMetrics.totalAreaPx2)!.toFixed(2)} mm²` : "----"}
            </div>
            <div className="border-t border-[--color-border] px-2 py-1">
              F&amp;P Area: {areaToMm2(editorMetrics.fpAreaPx2) !== null ? `${areaToMm2(editorMetrics.fpAreaPx2)!.toFixed(2)} mm²` : "----"}
            </div>
            <div className="border-t border-[--color-border] px-2 py-1">
              TM Area: {areaToMm2(editorMetrics.tmAreaPx2) !== null ? `${areaToMm2(editorMetrics.tmAreaPx2)!.toFixed(2)} mm²` : "----"}
            </div>
            <div className="border-t border-[--color-border] px-2 py-1">
              TM Area %: {editorMetrics.tmAreaPercent !== null ? `${editorMetrics.tmAreaPercent.toFixed(2)}%` : "----"}
            </div>
            <div className="border-t border-[--color-border] px-2 py-1">
              mm/px: {editorMetrics.mmPerPx > 0 ? editorMetrics.mmPerPx.toFixed(4) : "----"}
            </div>
            <div className="border-t border-[--color-border] px-2 py-1">
              Diameter: {editorMetrics.diameterLineCount === 0
                ? "----"
                : editorMetrics.diameterLineCount === 1
                  ? editorMetrics.diameterSingleMm !== null
                    ? `${editorMetrics.diameterSingleMm.toFixed(2)} mm`
                    : editorMetrics.diameterSinglePx !== null
                      ? `${editorMetrics.diameterSinglePx.toFixed(1)} px`
                      : "----"
                  : editorMetrics.diameterAverageMm !== null
                    ? `${editorMetrics.diameterAverageMm.toFixed(2)} mm (avg)`
                    : editorMetrics.diameterAveragePx !== null
                      ? `${editorMetrics.diameterAveragePx.toFixed(1)} px (avg)`
                      : "----"}
            </div>
          </div>
        </div>
        <div className="border-t border-[--color-border] bg-slate-900/40 px-2 py-1 text-center text-slate-300">
          Requirement of Thickness (
          {reqLowMm !== null && reqHighMm !== null
            ? `${reqLowMm.toFixed(3)} mm - ${reqHighMm.toFixed(3)} mm`
            : "---- - ----"}
          ) &amp; TM Area (30% - 50%)
        </div>
      </div>
    </div>
  );
}
