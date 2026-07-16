"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Printer,
  Settings2,
  FileText,
} from "lucide-react";

export type ReportPageSize = "A4" | "Letter";
export type ReportOrientation = "portrait" | "landscape";
export type ReportMarginPreset = "compact" | "normal" | "wide";
export type ReportFontScale = "small" | "normal" | "large";
export type ReportImageSize = "small" | "medium" | "large" | "fill";
export type ReportImageFit = "contain" | "cover";

export type ReportViewSettings = {
  pageSize: ReportPageSize;
  orientation: ReportOrientation;
  margin: ReportMarginPreset;
  showTitle: boolean;
  showLogo: boolean;
  showSignature: boolean;
  showImage: boolean;
  fontScale: ReportFontScale;
  imageSize: ReportImageSize;
  imageFit: ReportImageFit;
};

const STORAGE_KEY = "ring-test-report-view-settings-v1";

const DEFAULT_SETTINGS: ReportViewSettings = {
  pageSize: "A4",
  orientation: "portrait",
  margin: "normal",
  showTitle: true,
  showLogo: true,
  showSignature: true,
  showImage: true,
  fontScale: "normal",
  imageSize: "fill",
  imageFit: "contain",
};

function loadSettings(): ReportViewSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ReportViewSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function marginCss(preset: ReportMarginPreset): string {
  switch (preset) {
    case "compact":
      return "8mm 8mm 8mm 8mm";
    case "wide":
      return "20mm 15mm 15mm 20mm";
    default:
      return "15mm 10mm 10mm 15mm";
  }
}

function marginDimensions(preset: ReportMarginPreset) {
  switch (preset) {
    case "compact":
      return { verticalMm: 16, horizontalMm: 16 };
    case "wide":
      return { verticalMm: 35, horizontalMm: 35 };
    default:
      return { verticalMm: 25, horizontalMm: 25 };
  }
}

function pageDimensions(pageSize: ReportPageSize, orientation: ReportOrientation) {
  const portrait =
    pageSize === "A4"
      ? { widthMm: 210, heightMm: 297 }
      : { widthMm: 215.9, heightMm: 279.4 };
  return orientation === "portrait"
    ? portrait
    : { widthMm: portrait.heightMm, heightMm: portrait.widthMm };
}

type Props = {
  title: string;
  subtitle: string;
  backHref?: string;
  deleteSlot?: React.ReactNode;
  children: React.ReactNode;
};

export function ReportShell({
  title,
  subtitle,
  backHref = "/reports",
  deleteSlot,
  children,
}: Props) {
  const [settings, setSettings] = useState<ReportViewSettings>(DEFAULT_SETTINGS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings, hydrated]);

  const patch = <K extends keyof ReportViewSettings>(key: K, value: ReportViewSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const printCss = useMemo(() => {
    const size = `${settings.pageSize} ${settings.orientation}`;
    const margin = marginCss(settings.margin);
    const { widthMm, heightMm } = pageDimensions(settings.pageSize, settings.orientation);
    const { verticalMm } = marginDimensions(settings.margin);
    const w = `${widthMm}mm`;
    const h = `${heightMm}mm`;
    const contentH = `${heightMm - verticalMm}mm`;
    return `
@media print {
  @page {
    size: ${size};
    margin: ${margin};
  }
  html, body {
    width: ${w} !important;
    height: ${h} !important;
  }
  #printable {
    width: 100% !important;
    max-width: 100% !important;
    min-height: 0 !important;
    margin: 0 auto !important;
  }
  .print-sheet {
    width: 100% !important;
    min-height: ${contentH} !important;
    height: ${contentH} !important;
    max-height: ${contentH} !important;
    padding: 0 !important;
  }
}
`;
  }, [settings.pageSize, settings.orientation, settings.margin]);

  const preview = useMemo(() => {
    const { widthMm, heightMm } = pageDimensions(settings.pageSize, settings.orientation);
    return {
      maxWidth: `${widthMm}mm`,
      minHeight: `${heightMm}mm`,
      padding: marginCss(settings.margin),
    };
  }, [settings.pageSize, settings.orientation, settings.margin]);

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: printCss }} />

      <div className="card flex flex-col gap-3 px-5 py-4 no-print">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href={backHref} className="text-xs text-[--color-accent] hover:underline">
              ← Back to reports
            </Link>
            <h1 className="mt-1 text-lg font-semibold text-white">{title}</h1>
            <p className="text-sm text-[--color-muted]">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={panelOpen ? "btn-primary" : "btn-secondary"}
              onClick={() => setPanelOpen((v) => !v)}
              aria-expanded={panelOpen}
            >
              <Settings2 size={14} />
              <span className="hidden sm:inline">Report Settings</span>
              <span className="sm:hidden">Settings</span>
              {panelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button type="button" className="btn-secondary" onClick={() => window.print()}>
              <Printer size={14} />
              <span className="hidden sm:inline">Print / PDF</span>
              <span className="sm:hidden">Print</span>
            </button>
            {deleteSlot}
          </div>
        </div>

        {panelOpen ? (
          <>
            <p className="border-t border-[--color-border] pt-3 text-xs text-[--color-muted]">
              Changes apply instantly to the report preview below and are saved for future reports.
            </p>
            <div className="grid gap-3 lg:grid-cols-3">
              <SettingsCard
              icon={<FileText size={14} />}
              title="Page Settings"
              description="Paper size, orientation & margins"
            >
              <Field label="Paper size">
                <select
                  className="input h-8 text-xs"
                  value={settings.pageSize}
                  onChange={(e) => patch("pageSize", e.target.value as ReportPageSize)}
                >
                  <option value="A4">A4 (210 × 297 mm)</option>
                  <option value="Letter">Letter (8.5 × 11 in)</option>
                </select>
              </Field>
              <Field label="Orientation">
                <select
                  className="input h-8 text-xs"
                  value={settings.orientation}
                  onChange={(e) => patch("orientation", e.target.value as ReportOrientation)}
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </Field>
              <Field label="Margins">
                <select
                  className="input h-8 text-xs"
                  value={settings.margin}
                  onChange={(e) => patch("margin", e.target.value as ReportMarginPreset)}
                >
                  <option value="compact">Compact</option>
                  <option value="normal">Normal</option>
                  <option value="wide">Wide</option>
                </select>
              </Field>
              </SettingsCard>

              <SettingsCard
              icon={<Printer size={14} />}
              title="Print Settings"
              description="What appears on the printed sheet"
            >
              <Field label="Font size">
                <select
                  className="input h-8 text-xs"
                  value={settings.fontScale}
                  onChange={(e) => patch("fontScale", e.target.value as ReportFontScale)}
                >
                  <option value="small">Small</option>
                  <option value="normal">Normal</option>
                  <option value="large">Large</option>
                </select>
              </Field>
              <Toggle
                label="Show report title"
                checked={settings.showTitle}
                onChange={(v) => patch("showTitle", v)}
              />
              <Toggle
                label="Show company logo"
                checked={settings.showLogo}
                onChange={(v) => patch("showLogo", v)}
              />
              <Toggle
                label="Show signature line"
                checked={settings.showSignature}
                onChange={(v) => patch("showSignature", v)}
              />
              </SettingsCard>

              <SettingsCard
              icon={<ImageIcon size={14} />}
              title="Image Settings"
              description="Specimen image on the report"
            >
              <Toggle
                label="Show specimen image"
                checked={settings.showImage}
                onChange={(v) => patch("showImage", v)}
              />
              <Field label="Image size">
                <select
                  className="input h-8 text-xs"
                  value={settings.imageSize}
                  onChange={(e) => patch("imageSize", e.target.value as ReportImageSize)}
                  disabled={!settings.showImage}
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                  <option value="fill">Fill remaining</option>
                </select>
              </Field>
              <Field label="Image fit">
                <select
                  className="input h-8 text-xs"
                  value={settings.imageFit}
                  onChange={(e) => patch("imageFit", e.target.value as ReportImageFit)}
                  disabled={!settings.showImage}
                >
                  <option value="contain">Contain (full image)</option>
                  <option value="cover">Cover (crop to box)</option>
                </select>
              </Field>
              <button
                type="button"
                className="btn-ghost mt-1 w-full justify-center text-xs"
                onClick={() => setSettings(DEFAULT_SETTINGS)}
              >
                Reset to defaults
              </button>
              </SettingsCard>
            </div>
          </>
        ) : null}
      </div>

      <article
        id="printable"
        className="card mx-auto w-full overflow-hidden p-0 transition-[max-width] duration-200"
        style={{ maxWidth: preview.maxWidth }}
        data-page-size={settings.pageSize}
        data-orientation={settings.orientation}
        data-margin={settings.margin}
        data-font={settings.fontScale}
        data-show-title={settings.showTitle ? "1" : "0"}
        data-show-logo={settings.showLogo ? "1" : "0"}
        data-show-signature={settings.showSignature ? "1" : "0"}
        data-show-image={settings.showImage ? "1" : "0"}
        data-image-size={settings.imageSize}
        data-image-fit={settings.imageFit}
      >
        <section
          className="print-sheet text-black transition-[min-height,padding] duration-200"
          style={{ minHeight: preview.minHeight, padding: preview.padding }}
        >
          {children}
        </section>
      </article>
    </div>
  );
}

function SettingsCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[--color-border] bg-slate-900/40 p-3">
      <div className="mb-2 flex items-start gap-2">
        <span className="mt-0.5 text-slate-300">{icon}</span>
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-[11px] text-[--color-muted]">{description}</p>
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-[--color-border] bg-slate-950/40 px-2 py-1.5">
      <span className="text-xs text-slate-200">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-cyan-400"
      />
    </label>
  );
}
