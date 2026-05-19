"use client";

import { Camera, Loader2, Save, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { RingEditor } from "@/components/ring-editor/RingEditor";
import type { Circle, DiameterBox, RingResult } from "@/lib/analysis";
import type { AnalysisResults } from "@/lib/firebase/types";
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
}

export function NewTestClient({ defaults }: { defaults: Defaults }) {
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

  const [result, setResult] = useState<RingResult | null>(null);
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
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

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
    if (!sampleDiameter || Number(sampleDiameter) <= 0) {
      setToast({ kind: "err", text: "Enter a valid Sample diameter d (mm)." });
      return;
    }
    // Save the exact visible editor canvas as report image.
    const annotated = editorSnapshotRef.current?.() ?? null;
    if (!annotated) {
      setToast({ kind: "err", text: "Could not capture editor screenshot. Please try again." });
      return;
    }

    const analysisResults: AnalysisResults = {
      sample_diameter_mm: Number(sampleDiameter),
      mm_per_px:
        defaults.mmPerPxOverride && defaults.mmPerPxOverride > 0
          ? defaults.mmPerPxOverride
          : editorState.diam
            ? Number(sampleDiameter) / ((editorState.diam.w + editorState.diam.h) / 2)
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
    imgDim,
    testerName,
  ]);

  const deleteImage = useCallback(() => {
    stopCamera();
    setImageSrc(null);
    setImgDim({ w: 0, h: 0 });
    setResult(null);
    setEditorState({ inner: null, outer: null, diam: null });
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* Left — sample info + analysis */}
        <aside className="card max-h-[calc(100vh-96px)] space-y-4 overflow-y-auto p-4 xl:sticky xl:top-6">
          <h2 className="text-sm font-semibold text-white">Sample Information</h2>
          <Field label="Sample Description">
            <input
              value={sampleDescription}
              onChange={(e) => setSampleDescription(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Sample Diameter in mm">
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
            <Field label="Batch Number">
              <input
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="MFG Date">
              <input
                type="date"
                value={mfgDate}
                onChange={(e) => setMfgDate(e.target.value)}
                className="input"
              />
            </Field>
          </div>
          <ResultsPanel
            result={result}
            editorMetrics={editorMetrics}
          />
        </aside>

        {/* Right — image / camera + ring editor */}
        <div className="min-w-0 space-y-3">
          <RingEditor
            imageSrc={imageSrc}
            imageWidth={imgDim.w}
            imageHeight={imgDim.h}
            sampleDiameterMm={sampleDiameter ? Number(sampleDiameter) : null}
            mmPerPxOverride={defaults.mmPerPxOverride}
            angularCorrectionDeg={defaults.angularCorrectionDeg}
            thicknessOuterGapPx={defaults.thicknessOuterGapPx}
            thicknessInnerGapPx={defaults.thicknessInnerGapPx}
            style={defaults.style}
            onResult={setResult}
            onStateChange={setEditorState}
            onMetricsChange={setEditorMetrics}
            cameraOn={cameraOn}
            cameraVideoRef={videoRef}
            onDeleteImage={deleteImage}
            snapshotRef={editorSnapshotRef}
            onImageReplace={(nextImageSrc, dims) => {
              setImageSrc(nextImageSrc);
              setImgDim(dims);
            }}
            saveControl={
              <button type="button" disabled={pending} className="btn-primary" onClick={openSaveDialog}>
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save Result
              </button>
            }
            extraControls={
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} />
                  Upload Image
                </button>
                {!cameraOn ? (
                  <button type="button" className="btn-secondary" onClick={startCamera}>
                    <Camera size={14} />
                    Start Camera
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn-primary" onClick={captureFromCamera}>
                      <Camera size={14} />
                      Capture
                    </button>
                    <button type="button" className="btn-ghost" onClick={stopCamera}>
                      <X size={14} />
                      Stop
                    </button>
                  </>
                )}
              </>
            }
          />
        </div>
      </div>
      {saveDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
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
    <div className="border-t border-[--color-border] pt-4">
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
            {sortedPairs.map((p, i) => (
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

