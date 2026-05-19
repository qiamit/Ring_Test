"use client";

import { useMemo, useState, useTransition } from "react";

import type { CalibrationRecord } from "@/lib/firebase/types";
import { formatDate } from "@/lib/utils";

import { deleteCalibration, saveCalibration } from "./actions";

type Cal = CalibrationRecord;

function formatCalNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4) : "—";
}

export function CalibrationClient({ history }: { history: Cal[] }) {
  const [tab, setTab] = useState<"linear" | "angular" | "validate">("linear");
  const [rows, setRows] = useState<Cal[]>(history);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Cal | null>(null);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeletingId(deleteTarget.id);
    const res = await deleteCalibration(deleteTarget.id);
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } else {
      setDeleteError(res.error);
    }
    setDeletingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-2 p-3">
        <TabBtn current={tab} target="linear" onClick={() => setTab("linear")}>
          Linear (mm/px)
        </TabBtn>
        <TabBtn current={tab} target="angular" onClick={() => setTab("angular")}>
          Angular (Δ°)
        </TabBtn>
        <TabBtn current={tab} target="validate" onClick={() => setTab("validate")}>
          Validation
        </TabBtn>
      </div>

      {tab === "linear" ? <LinearPanel /> : null}
      {tab === "angular" ? <AngularPanel /> : null}
      {tab === "validate" ? <ValidationPanel /> : null}

      <section className="card p-4">
        <h3 className="mb-2 text-sm font-semibold text-white">Recent calibration records</h3>
        <div className="overflow-x-auto rounded-lg border border-[--color-border]">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Date</th>
                <th className="px-3 py-2 text-left font-semibold">Type</th>
                <th className="px-3 py-2 text-left font-semibold">Operator</th>
                <th className="px-3 py-2 text-right font-semibold">Reference</th>
                <th className="px-3 py-2 text-right font-semibold">Measured</th>
                <th className="px-3 py-2 text-right font-semibold">Result</th>
                <th className="px-3 py-2 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id} className="border-t border-[--color-border]">
                  <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(h.created_at)}</td>
                  <td className="px-3 py-1.5 capitalize">{h.kind}</td>
                  <td className="px-3 py-1.5">{h.operator}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatCalNumber(h.reference_value)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatCalNumber(h.measured_value)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatCalNumber(h.result_value)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      disabled={deletingId === h.id}
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(h);
                      }}
                      className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingId === h.id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[--color-muted]">
                    No calibration records yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {deleteError ? <p className="mt-2 text-xs text-red-300">Delete failed: {deleteError}</p> : null}
      </section>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-calibration-title"
            className="w-full max-w-sm rounded-xl border border-[--color-border] bg-slate-950 p-5 shadow-2xl"
          >
            <h3 id="delete-calibration-title" className="text-base font-semibold text-white">
              Delete calibration record?
            </h3>
            <p className="mt-2 text-sm text-[--color-muted]">
              This will permanently remove the {deleteTarget.kind} calibration by{" "}
              <span className="font-medium text-slate-200">{deleteTarget.operator}</span> (
              {formatDate(deleteTarget.created_at)}). This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deletingId === deleteTarget.id}
                onClick={() => setDeleteTarget(null)}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingId === deleteTarget.id}
                onClick={() => void confirmDelete()}
                className="rounded-lg border border-red-500/40 bg-red-600/20 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-600/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingId === deleteTarget.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TabBtn({
  current,
  target,
  onClick,
  children,
}: {
  current: string;
  target: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const active = current === target;
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-lg border border-blue-500/40 bg-blue-500/15 px-3 py-1.5 text-sm font-semibold text-blue-200"
          : "rounded-lg border border-[--color-border-strong] bg-slate-800/40 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-700"
      }
    >
      {children}
    </button>
  );
}

function LinearPanel() {
  const [reference, setReference] = useState("");
  const [measured, setMeasured] = useState("");
  const [operator, setOperator] = useState("");
  const [apply, setApply] = useState(true);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const result = useMemo(() => {
    const r = Number(reference);
    const m = Number(measured);
    if (!r || !m) return null;
    return r / m; // mm per px
  }, [reference, measured]);

  return (
    <div className="card grid gap-3 p-4 md:grid-cols-3">
      <div>
        <label className="label mb-1 block">Reference size (mm)</label>
        <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <div>
        <label className="label mb-1 block">Measured size (px)</label>
        <input className="input" value={measured} onChange={(e) => setMeasured(e.target.value)} />
      </div>
      <div>
        <label className="label mb-1 block">Operator</label>
        <input className="input" value={operator} onChange={(e) => setOperator(e.target.value)} />
      </div>
      <div className="md:col-span-3 flex flex-wrap items-center gap-3">
        <span className="rounded-lg border border-[--color-border-strong] bg-slate-800/40 px-3 py-1.5 text-sm">
          mm / px:&nbsp;
          <span className="font-mono text-blue-300">
            {result !== null ? result.toFixed(6) : "—"}
          </span>
        </span>
        <label className="flex items-center gap-2 text-sm text-[--color-muted]">
          <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} />
          Apply as default mm/px
        </label>
        {toast ? <span className="text-sm text-green-300">{toast}</span> : null}
        <button
          type="button"
          disabled={pending || result === null || !operator}
          className="btn-primary ml-auto"
          onClick={() => {
            if (result === null) return;
            startTransition(async () => {
              const res = await saveCalibration({
                kind: "linear",
                operator,
                reference_value: Number(reference),
                measured_value: Number(measured),
                result_value: result,
                apply_mm_per_px: apply,
              });
              setToast(res.ok ? "Saved" : `Error: ${res.error}`);
            });
          }}
        >
          {pending ? "Saving…" : "Save calibration"}
        </button>
      </div>
    </div>
  );
}

function AngularPanel() {
  const [reference, setReference] = useState("");
  const [observed, setObserved] = useState("");
  const [operator, setOperator] = useState("");
  const [apply, setApply] = useState(true);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const delta = useMemo(() => {
    const r = Number(reference);
    const o = Number(observed);
    if (!Number.isFinite(r) || !Number.isFinite(o)) return null;
    let d = r - o;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }, [reference, observed]);

  return (
    <div className="card grid gap-3 p-4 md:grid-cols-3">
      <div>
        <label className="label mb-1 block">Reference angle (°)</label>
        <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <div>
        <label className="label mb-1 block">Observed angle (°)</label>
        <input className="input" value={observed} onChange={(e) => setObserved(e.target.value)} />
      </div>
      <div>
        <label className="label mb-1 block">Operator</label>
        <input className="input" value={operator} onChange={(e) => setOperator(e.target.value)} />
      </div>
      <div className="md:col-span-3 flex flex-wrap items-center gap-3">
        <span className="rounded-lg border border-[--color-border-strong] bg-slate-800/40 px-3 py-1.5 text-sm">
          Δ correction:&nbsp;
          <span className="font-mono text-blue-300">
            {delta !== null ? `${delta.toFixed(3)}°` : "—"}
          </span>
        </span>
        <label className="flex items-center gap-2 text-sm text-[--color-muted]">
          <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} />
          Apply as default angular correction
        </label>
        {toast ? <span className="text-sm text-green-300">{toast}</span> : null}
        <button
          type="button"
          disabled={pending || delta === null || !operator}
          className="btn-primary ml-auto"
          onClick={() => {
            if (delta === null) return;
            startTransition(async () => {
              const res = await saveCalibration({
                kind: "angular",
                operator,
                reference_value: Number(reference),
                measured_value: Number(observed),
                result_value: delta,
                apply_angular_correction: apply,
              });
              setToast(res.ok ? "Saved" : `Error: ${res.error}`);
            });
          }}
        >
          {pending ? "Saving…" : "Save calibration"}
        </button>
      </div>
    </div>
  );
}

function ValidationPanel() {
  const [expected, setExpected] = useState("");
  const [observed, setObserved] = useState("");
  const [tol, setTol] = useState("0.05");
  const result = useMemo(() => {
    const e = Number(expected);
    const o = Number(observed);
    const t = Number(tol);
    if (!Number.isFinite(e) || !Number.isFinite(o) || !Number.isFinite(t)) return null;
    const diff = Math.abs(o - e);
    return { diff, ok: diff <= t };
  }, [expected, observed, tol]);
  return (
    <div className="card grid gap-3 p-4 md:grid-cols-4">
      <div>
        <label className="label mb-1 block">Expected</label>
        <input className="input" value={expected} onChange={(e) => setExpected(e.target.value)} />
      </div>
      <div>
        <label className="label mb-1 block">Observed</label>
        <input className="input" value={observed} onChange={(e) => setObserved(e.target.value)} />
      </div>
      <div>
        <label className="label mb-1 block">Tolerance</label>
        <input className="input" value={tol} onChange={(e) => setTol(e.target.value)} />
      </div>
      <div className="flex items-end">
        {result ? (
          <span className={result.ok ? "pill-pass" : "pill-fail"}>
            {result.ok ? `Within tolerance (Δ=${result.diff.toFixed(4)})` : `Out of tolerance (Δ=${result.diff.toFixed(4)})`}
          </span>
        ) : (
          <span className="pill-neutral">Enter values</span>
        )}
      </div>
    </div>
  );
}
