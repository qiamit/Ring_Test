import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getSessionUser } from "@/lib/firebase/auth-server";
import { getSettings, getTestById } from "@/lib/firebase/data";
import { companyLogoPublicUrl, ringImagePublicUrl } from "@/lib/firebase/storage";
import type { AnalysisResults } from "@/lib/firebase/types";

import { AutoPrint } from "./auto-print";
import { DeleteButton } from "./delete-button";
import { PrintButton } from "./print-button";

type ReportSettings = Awaited<ReturnType<typeof getSettings>>;

function formatThicknessDesignation(label: string): string {
  return `Thickness ${label.trim().toUpperCase()}`;
}

function formatCompanyContact(settings: ReportSettings): string {
  const phone = settings?.company_contact_phone?.trim() ?? "";
  const email = settings?.company_email?.trim() ?? "";
  if (phone && email) return `Mobile: ${phone}  |  Email: ${email}`;
  if (phone) return `Mobile: ${phone}`;
  if (email) return `Email: ${email}`;
  return "Contact Details";
}

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const autoPrint = query.print === "1";
  const user = await getSessionUser();
  if (!user) notFound();

  const row = await getTestById(id);
  if (!row) notFound();

  const settings = await getSettings(user.uid);
  const imageUrl = row.image_path ? ringImagePublicUrl(row.image_path) : null;

  const r = row.results as AnalysisResults;
  const designationOrder = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
  const sortedThickness = [...(r.thickness_measurements ?? [])].sort(
    (a, b) =>
      designationOrder.indexOf(a.label.toLowerCase()) -
      designationOrder.indexOf(b.label.toLowerCase()),
  );
  return REPORT_DETAIL_JSX({
    autoPrint,
    row,
    settings,
    imageUrl,
    sortedThickness,
    r,
  });
}

function REPORT_DETAIL_JSX(props: {
  autoPrint: boolean;
  row: Awaited<ReturnType<typeof getTestById>> & object;
  settings: Awaited<ReturnType<typeof getSettings>>;
  imageUrl: string | null;
  sortedThickness: AnalysisResults["thickness_measurements"];
  r: AnalysisResults;
}) {
  const { autoPrint, row, settings, imageUrl, sortedThickness, r } = props;
  if (!row) return null;

  return (
    <div className="space-y-4">
      {autoPrint ? <AutoPrint /> : null}
      <div className="card flex flex-col gap-2 px-5 py-4 lg:flex-row lg:items-center lg:justify-between no-print">
        <div>
          <Link href="/reports" className="text-xs text-[--color-accent] hover:underline">
            ← Back to reports
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-white">
            Report — {row.sample_description ?? "Sample"}
          </h1>
          <p className="text-sm text-[--color-muted]">
            {row.test_date} {row.test_time} · Tester {row.tester_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton />
          <DeleteButton
            id={row.id}
            testDate={row.test_date}
            sampleDescription={row.sample_description}
          />
        </div>
      </div>

      <article id="printable" className="card p-0">
        <section className="print-sheet text-black">
          <ReportPrintBody
            settings={settings}
            row={row}
            imageUrl={imageUrl}
            sortedThickness={sortedThickness}
            r={r}
          />
        </section>
      </article>
    </div>
  );
}

function ReportPrintBody({
  settings,
  row,
  imageUrl,
  sortedThickness,
  r,
}: {
  settings: Awaited<ReturnType<typeof getSettings>>;
  row: NonNullable<Awaited<ReturnType<typeof getTestById>>>;
  imageUrl: string | null;
  sortedThickness: AnalysisResults["thickness_measurements"];
  r: AnalysisResults;
}) {
  const logoUrl = settings?.company_logo_path
    ? companyLogoPublicUrl(settings.company_logo_path)
    : null;
  const totalAreaMm2 =
    r.area_tm_mm2 !== null || r.area_fp_mm2 !== null
      ? (r.area_tm_mm2 ?? 0) + (r.area_fp_mm2 ?? 0)
      : null;
  return (
    <>
      <div className="sheet-header">
        <div className="sheet-title">RING TEST MANAGER</div>
        <div className="sheet-header-row">
          <div className="sheet-header-details">
            <div className="sheet-company sheet-company-name">
              {settings?.company_name || "Firm Name"}
            </div>
            <div className="sheet-company">{settings?.company_address || "Address"}</div>
            <div className="sheet-company">{formatCompanyContact(settings)}</div>
          </div>
          {logoUrl ? (
            <div className="sheet-header-logo">
              <Image
                src={logoUrl}
                alt="Company logo"
                width={200}
                height={80}
                unoptimized
                className="sheet-logo"
              />
            </div>
          ) : null}
        </div>
      </div>
      <div className="sheet-top-grid">
        <div className="sheet-box">
          <table className="sheet-table">
            <SheetMeasurementColGroup />
            <tbody>
              <InfoRow label="Sample Description" value={row.sample_description ?? ""} />
              <InfoRow label="Sample Diameter in mm" value={String(row.sample_diameter_mm)} />
              <InfoRow label="Batch Number" value={row.batch_number ?? ""} />
              <InfoRow label="Date of Testing" value={`${row.test_date} ${row.test_time}`} />
              <InfoRow label="Date of Manufacturing" value={row.mfg_date ?? ""} />
              <InfoRow label="Operator Name" value={row.tester_name} />
              <InfoRow label="Observation" value={row.observations ?? ""} multiline />
            </tbody>
          </table>
          <div className="sheet-box-divider" aria-hidden />
          <table className="sheet-table sheet-area-table">
            <SheetMeasurementColGroup />
            <thead>
              <tr>
                <th colSpan={3} className="center">
                  Area Measurement
                </th>
              </tr>
              <tr>
                <th className="label-cell">Area Designation</th>
                <th className="colon-cell">:</th>
                <th className="center">Results</th>
              </tr>
            </thead>
            <tbody>
              <MeasurementRow
                label="Total Area"
                value={totalAreaMm2 !== null ? `${totalAreaMm2.toFixed(2)} mm²` : "----"}
                center
              />
              <MeasurementRow
                label="F&P Area"
                value={r.area_fp_mm2 !== null ? `${r.area_fp_mm2.toFixed(2)} mm²` : "----"}
                center
              />
              <MeasurementRow
                label="TM Area"
                value={r.area_tm_mm2 !== null ? `${r.area_tm_mm2.toFixed(2)} mm²` : "----"}
                center
              />
              <MeasurementRow
                label="TM Area %"
                value={
                  r.tm_area_fraction_percent !== null
                    ? `${r.tm_area_fraction_percent.toFixed(2)}%`
                    : "----"
                }
                center
              />
              <MeasurementRow
                label="Diameter"
                value={
                  r.sample_diameter_mm
                    ? `${r.sample_diameter_mm.toFixed(2)} mm`
                    : "----"
                }
                center
              />
            </tbody>
          </table>
        </div>

        <div className="sheet-box">
          <table className="sheet-table sheet-thickness-table">
            <SheetMeasurementColGroup />
            <thead>
              <tr>
                <th colSpan={3} className="center">
                  Thickness Measurement
                </th>
              </tr>
              <tr>
                <th className="label-cell">Thickness Designation</th>
                <th className="colon-cell">:</th>
                <th className="center">Results in mm</th>
              </tr>
            </thead>
            <tbody>
              {sortedThickness.map((m) => (
                <MeasurementRow
                  key={m.label}
                  label={formatThicknessDesignation(m.label)}
                  value={m.thickness_mm !== null ? m.thickness_mm.toFixed(4) : ""}
                  center
                />
              ))}
              <MeasurementRow
                label="Minimum Thickness"
                value={r.thickness_min_mm !== null ? r.thickness_min_mm.toFixed(4) : "----"}
                center
              />
              <MeasurementRow
                label="Maximum Thickness"
                value={r.thickness_max_mm !== null ? r.thickness_max_mm.toFixed(4) : "----"}
                center
              />
              <MeasurementRow
                label="Average Thickness"
                value={r.thickness_mean_mm !== null ? r.thickness_mean_mm.toFixed(4) : "----"}
                center
              />
              <tr>
                <td colSpan={3} className="center">
                  Requirement of Thickness ({r.thickness_range_low_mm?.toFixed(3) ?? "----"} -{" "}
                  {r.thickness_range_high_mm?.toFixed(3) ?? "----"}) &amp; TM Area (30 % - 50 %)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="sheet-image-box">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt="Annotated specimen"
            fill
            unoptimized
            className="sheet-image"
            sizes="(max-width: 1024px) 100vw, 700px"
          />
        ) : (
          <div className="sheet-image-placeholder">Image</div>
        )}
      </div>

      <div className="sheet-signature-row">
        <div
          className="sheet-signature"
        >
          Authorized Signatory
        </div>
      </div>
    </>
  );
}

function SheetMeasurementColGroup() {
  return (
    <colgroup>
      <col className="sheet-col-label" />
      <col className="sheet-col-colon" />
      <col className="sheet-col-value" />
    </colgroup>
  );
}

function InfoRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <tr>
      <td className="label-cell">{label}</td>
      <td className="colon-cell">:</td>
      <td className={multiline ? "value-cell multiline-value" : "value-cell"}>{value}</td>
    </tr>
  );
}

function MeasurementRow({
  label,
  value,
  center,
}: {
  label: string;
  value: string;
  center?: boolean;
}) {
  return (
    <tr>
      <td className="label-cell">{label}</td>
      <td className="colon-cell">:</td>
      <td className={center ? "value-cell center" : "value-cell"}>{value}</td>
    </tr>
  );
}
