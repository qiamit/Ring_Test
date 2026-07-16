"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import type { AiConfigPublic, SettingsRecord } from "@/lib/firebase/types";

import { AiModelSettings } from "./ai-model-settings";
import { saveSettings, uploadLogo, type SettingsInput } from "./actions";

type Settings = SettingsRecord;

const DEFAULTS: Omit<Settings, "user_id" | "updated_at"> = {
  mm_per_px_override: null,
  angular_correction_deg: 0,
  units: "mm",
  date_format: "yyyy-mm-dd",
  time_format: "24h",
  inner_color: "#fde047",
  outer_color: "#f472b6",
  diam_color: "#fb923c",
  thick_color: "#4ade80",
  inner_width: 1,
  outer_width: 1,
  diam_width: 1,
  thick_width: 1,
  thickness_outer_gap_px: 1,
  thickness_inner_gap_px: 1,
  company_logo_path: null,
  company_name: "",
  company_address: "",
  company_gst: "",
  company_email: "",
  company_contact_name: "",
  company_contact_phone: "",
  tenant_id: null,
};

export function SettingsForm({
  initial,
  isSuperAdmin = false,
  aiConfig = null,
}: {
  initial: Settings | null;
  isSuperAdmin?: boolean;
  aiConfig?: AiConfigPublic | null;
}) {
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [showCameraSettings, setShowCameraSettings] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDeviceId, setCameraDeviceId] = useState("");
  const [cameraFacingMode, setCameraFacingMode] = useState<"environment" | "user">("environment");
  const [cameraWidth, setCameraWidth] = useState(1280);
  const [cameraHeight, setCameraHeight] = useState(720);
  const [cameraFps, setCameraFps] = useState(30);
  const [cameraStatus, setCameraStatus] = useState<string>("Click Start Preview");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [s, setS] = useState<Omit<Settings, "user_id" | "updated_at">>(() => ({
    ...DEFAULTS,
    ...(initial ? stripIds(initial) : {}),
  }));

  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => {
    setS((prev) => ({ ...prev, [k]: v }));
  };

  const submit = () => {
    startTransition(async () => {
      const payload: SettingsInput = { ...(s as SettingsInput) };

      if (logoFile) {
        const fd = new FormData();
        fd.append("logo", logoFile);
        const uploadRes = await uploadLogo(fd);
        if (!uploadRes.ok) {
          setToast({ kind: "err", text: uploadRes.error });
          return;
        }
        payload.company_logo_path = uploadRes.path;
      }

      const res = await saveSettings(payload);
      if (res.ok) setToast({ kind: "ok", text: "Settings saved." });
      else setToast({ kind: "err", text: res.error });
    });
  };

  const stopCameraPreview = () => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
  };

  const listCameraDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      setCameraDevices(cams);
      if (!cameraDeviceId && cams[0]?.deviceId) setCameraDeviceId(cams[0].deviceId);
    } catch {
      setCameraStatus("Unable to read camera devices.");
    }
  };

  const startCameraPreview = async () => {
    try {
      stopCameraPreview();
      setCameraStatus("Starting camera...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: cameraDeviceId
          ? {
              deviceId: { exact: cameraDeviceId },
              width: { ideal: cameraWidth },
              height: { ideal: cameraHeight },
              frameRate: { ideal: cameraFps },
            }
          : {
              facingMode: { ideal: cameraFacingMode },
              width: { ideal: cameraWidth },
              height: { ideal: cameraHeight },
              frameRate: { ideal: cameraFps },
            },
        audio: false,
      });
      cameraStreamRef.current = stream;
      await listCameraDevices();
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        await cameraVideoRef.current.play();
      }
      setCameraStatus("Live preview running.");
    } catch (err) {
      setCameraStatus(`Camera error: ${(err as Error).message}`);
    }
  };

  useEffect(() => {
    if (showCameraSettings) {
      void listCameraDevices();
    } else {
      stopCameraPreview();
    }
    return () => stopCameraPreview();
  }, [showCameraSettings]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Calibration overrides</h2>
          <button
            type="button"
            onClick={() => setShowCameraSettings(true)}
            className="rounded-md border border-[--color-border-strong] bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            Camera Setting
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="mm/px override (fallback if test has no mm/px)">
            <input
              type="number"
              step="0.0001"
              value={s.mm_per_px_override ?? ""}
              onChange={(e) =>
                set("mm_per_px_override", e.target.value ? Number(e.target.value) : null)
              }
              className="input"
              placeholder="auto"
            />
          </Field>
          <Field label="Units">
            <select
              value={s.units}
              onChange={(e) => set("units", e.target.value as Settings["units"])}
              className="input"
            >
              <option value="mm">mm</option>
              <option value="inch">inch</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Drawing style</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { keyC: "inner_color", keyW: "inner_width", label: "Inner ring" },
            { keyC: "outer_color", keyW: "outer_width", label: "Outer ring" },
            { keyC: "diam_color", keyW: "diam_width", label: "Diameter" },
            { keyC: "thick_color", keyW: "thick_width", label: "Thickness" },
          ].map((row) => (
            <div key={row.keyC} className="rounded-lg border border-[--color-border] p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[--color-muted]">
                {row.label}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={s[row.keyC as keyof typeof s] as string}
                  onChange={(e) => set(row.keyC as keyof typeof s, e.target.value as never)}
                  className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent"
                />
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={s[row.keyW as keyof typeof s] as number}
                  onChange={(e) => set(row.keyW as keyof typeof s, Number(e.target.value) as never)}
                  className="input"
                />
              </div>
            </div>
          ))}
          <Field label="Gap from Outer Ring">
            <input
              type="number"
              step="0.1"
              value={s.thickness_outer_gap_px}
              onChange={(e) => set("thickness_outer_gap_px", Number(e.target.value) || 1)}
              className="input"
            />
          </Field>
          <Field label="Gap from Inner Ring">
            <input
              type="number"
              step="0.1"
              value={s.thickness_inner_gap_px}
              onChange={(e) => set("thickness_inner_gap_px", Number(e.target.value) || 1)}
              className="input"
            />
          </Field>
        </div>
      </section>

      <section className="card p-4 lg:col-span-2">
        <h2 className="mb-3 text-sm font-semibold text-white">Company Details for Letter Head</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Upload Company logo">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              className="input file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-600"
            />
          </Field>
          <Field label="Company name">
            <input
              value={s.company_name ?? ""}
              onChange={(e) => set("company_name", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="GST">
            <input
              value={s.company_gst ?? ""}
              onChange={(e) => set("company_gst", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Address">
            <input
              value={s.company_address ?? ""}
              onChange={(e) => set("company_address", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Email">
            <input
              value={s.company_email ?? ""}
              onChange={(e) => set("company_email", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Contact name">
            <input
              value={s.company_contact_name ?? ""}
              onChange={(e) => set("company_contact_name", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Contact phone">
            <input
              value={s.company_contact_phone ?? ""}
              onChange={(e) => set("company_contact_phone", e.target.value)}
              className="input"
            />
          </Field>
        </div>
      </section>

      {isSuperAdmin && aiConfig ? <AiModelSettings initial={aiConfig} /> : null}

      <div className="lg:col-span-2 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        {toast ? (
          <span
            className={
              toast.kind === "ok"
                ? "rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-sm text-green-300"
                : "rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-300"
            }
          >
            {toast.text}
          </span>
        ) : null}
        <button type="button" disabled={pending} onClick={submit} className="btn-primary">
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
      {showCameraSettings ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-[--color-border] bg-slate-950 p-4 shadow-xl sm:rounded-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Camera Settings</h3>
              <button
                type="button"
                onClick={() => setShowCameraSettings(false)}
                className="rounded-md border border-[--color-border-strong] px-2 py-1 text-xs text-slate-300"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Camera device">
                <select
                  value={cameraDeviceId}
                  onChange={(e) => setCameraDeviceId(e.target.value)}
                  className="input"
                >
                  <option value="">Auto</option>
                  {cameraDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Facing mode">
                <select
                  value={cameraFacingMode}
                  onChange={(e) => setCameraFacingMode(e.target.value as "environment" | "user")}
                  className="input"
                >
                  <option value="environment">Back (environment)</option>
                  <option value="user">Front (user)</option>
                </select>
              </Field>
              <Field label="Width (px)">
                <input
                  type="number"
                  value={cameraWidth}
                  onChange={(e) => setCameraWidth(Number(e.target.value) || 1280)}
                  className="input"
                />
              </Field>
              <Field label="Height (px)">
                <input
                  type="number"
                  value={cameraHeight}
                  onChange={(e) => setCameraHeight(Number(e.target.value) || 720)}
                  className="input"
                />
              </Field>
              <Field label="FPS">
                <input
                  type="number"
                  value={cameraFps}
                  onChange={(e) => setCameraFps(Number(e.target.value) || 30)}
                  className="input"
                />
              </Field>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={() => void startCameraPreview()} className="btn-secondary">
                Start Preview
              </button>
              <button type="button" onClick={stopCameraPreview} className="btn-ghost">
                Stop
              </button>
              <span className="text-xs text-[--color-muted]">{cameraStatus}</span>
            </div>
            <div className="mt-3 overflow-hidden rounded-md border border-[--color-border] bg-black">
              <video
                ref={cameraVideoRef}
                autoPlay
                muted
                playsInline
                className="h-56 w-full object-contain"
              />
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

function stripIds(row: Settings): Omit<Settings, "user_id" | "updated_at"> {
  const { user_id: _u, updated_at: _t, ...rest } = row;
  void _u;
  void _t;
  return rest;
}
