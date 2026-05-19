import Link from "next/link";

import { getSessionUser } from "@/lib/firebase/auth-server";
import { listTestsForUser } from "@/lib/firebase/data";
import { DeleteRecordButton } from "./delete-record-button";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const currentPage = Math.max(1, Number(params.page ?? "1") || 1);
  const pageSize = 20;

  const user = await getSessionUser();
  if (!user) return null;

  const { rows, total: totalRecords, error } = await listTestsForUser(user.uid, {
    q,
    page: currentPage,
    pageSize,
  });
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const prevPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  const buildHref = (page: number) => {
    const qp = new URLSearchParams();
    if (q) qp.set("q", q);
    if (page > 1) qp.set("page", String(page));
    const qs = qp.toString();
    return qs ? `/reports?${qs}` : "/reports";
  };

  return (
    <div className="space-y-4">
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by sample, batch, or tester…"
          className="input"
        />
        <input type="hidden" name="page" value="1" />
        <button type="submit" className="btn-secondary">
          Search
        </button>
        {q ? (
          <Link href="/reports" className="btn-ghost">
            Clear
          </Link>
        ) : null}
        <span className="ml-auto rounded-md border border-[--color-border] bg-slate-900/40 px-3 py-1.5 text-xs text-slate-300">
          Total Records: <span className="font-semibold text-slate-100">{totalRecords}</span>
        </span>
      </form>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Date</th>
              <th className="px-4 py-3 text-left font-semibold">Sample</th>
              <th className="px-4 py-3 text-left font-semibold">d (mm)</th>
              <th className="px-4 py-3 text-left font-semibold">Batch</th>
              <th className="px-4 py-3 text-left font-semibold">Tester</th>
              <th className="px-4 py-3 text-left font-semibold">Mean</th>
              <th className="px-4 py-3 text-left font-semibold">Verdict</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const mean = r.results?.thickness_mean_mm;
              const pass = r.results?.overall_pass;
              return (
                <tr key={r.id} className="border-t border-[--color-border] hover:bg-slate-800/30">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-300">
                    {r.test_date} {r.test_time}
                  </td>
                  <td className="px-4 py-2 text-slate-200">{r.sample_description ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-slate-300">{r.sample_diameter_mm}</td>
                  <td className="px-4 py-2 text-slate-300">{r.batch_number ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-300">{r.tester_name}</td>
                  <td className="px-4 py-2 font-mono text-slate-300">
                    {mean !== null && mean !== undefined ? mean.toFixed(3) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {pass === true ? (
                      <span className="pill-pass">PASS</span>
                    ) : pass === false ? (
                      <span className="pill-fail">FAIL</span>
                    ) : (
                      <span className="pill-neutral">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-3">
                      <Link
                        href={`/reports/${r.id}?print=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[--color-accent] hover:underline"
                      >
                        View
                      </Link>
                      <DeleteRecordButton
                        id={r.id}
                        testDate={r.test_date}
                        sampleDescription={r.sample_description}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[--color-muted]">
                  No reports yet. Go to{" "}
                  <Link href="/new-test" className="text-[--color-accent] hover:underline">
                    New Test
                  </Link>{" "}
                  to create one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Link
          href={buildHref(prevPage)}
          aria-disabled={currentPage <= 1}
          className={
            currentPage <= 1 ? "btn-ghost pointer-events-none opacity-40" : "btn-ghost"
          }
        >
          Prev
        </Link>
        <span className="rounded-md border border-[--color-border] bg-slate-900/40 px-3 py-1.5 text-xs text-slate-300">
          Page {currentPage} / {totalPages}
        </span>
        <Link
          href={buildHref(nextPage)}
          aria-disabled={currentPage >= totalPages}
          className={
            currentPage >= totalPages
              ? "btn-ghost pointer-events-none opacity-40"
              : "btn-ghost"
          }
        >
          Next
        </Link>
      </div>
    </div>
  );
}
