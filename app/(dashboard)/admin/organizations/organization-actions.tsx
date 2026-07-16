"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { OrganizationStatus } from "@/lib/firebase/types";
import { cn } from "@/lib/utils";

import {
  setOrganizationAction,
  setOrganizationAiEnabledAction,
  type OrganizationAction,
} from "./actions";

const STATUS_OPTIONS: { value: OrganizationAction; label: string }[] = [
  { value: "approved", label: "Approved" },
  { value: "hold", label: "Hold" },
  { value: "rejected", label: "Reject" },
];

function statusToSelectValue(status: OrganizationStatus): string {
  if (status === "approved" || status === "hold" || status === "rejected") return status;
  return "";
}

export function OrganizationStatusSelect({
  tenantId,
  status,
}: {
  tenantId: string;
  status: OrganizationStatus;
}) {
  const router = useRouter();
  const selectRef = useRef<HTMLSelectElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectValue = statusToSelectValue(status);

  async function onChange(next: string) {
    if (!next || next === selectValue || loading) return;
    const action = next as OrganizationAction;

    let reason: string | undefined;
    if (action === "rejected") {
      reason = window.prompt("Rejection reason (optional):") ?? "";
    }

    setLoading(true);
    setError(null);
    const res = await setOrganizationAction(tenantId, action, reason);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      if (selectRef.current) selectRef.current.value = selectValue;
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-fit flex-col items-center gap-1">
      <select
        key={status}
        ref={selectRef}
        defaultValue={selectValue}
        disabled={loading}
        onChange={(e) => void onChange(e.target.value)}
        className={cn(
          "min-w-[7.5rem] rounded-md border border-[--color-border] bg-slate-900/80 px-2 py-1.5 text-center text-xs font-semibold",
          "focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          status === "pending" && "text-amber-200",
          status === "approved" && "text-emerald-200",
          status === "hold" && "text-orange-200",
          status === "rejected" && "text-red-200",
        )}
        aria-label="Organization status"
      >
        {status === "pending" ? (
          <option value="" disabled>
            Pending
          </option>
        ) : null}
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? <span className="text-center text-[10px] text-red-300">{error}</span> : null}
    </div>
  );
}

export function OrganizationActions({
  tenantId,
  status,
  aiEnabled,
}: {
  tenantId: string;
  status: OrganizationStatus;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [aiLoading, setAiLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleAi(next: boolean) {
    setAiLoading(true);
    setError(null);
    const res = await setOrganizationAiEnabledAction(tenantId, next);
    setAiLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  async function onDelete() {
    const confirmed = window.confirm(
      "Delete this organization permanently? This removes the firm record, memberships, and associated tests.",
    );
    if (!confirmed) return;
    setDeleteLoading(true);
    setError(null);
    const res = await setOrganizationAction(tenantId, "delete");
    setDeleteLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-fit flex-col items-center gap-2">
      <label className="flex items-center justify-center gap-2 text-xs text-slate-300">
        <span className={aiEnabled ? "text-violet-200" : "text-slate-500"}>AI</span>
        <button
          type="button"
          role="switch"
          aria-checked={aiEnabled}
          disabled={aiLoading || status !== "approved"}
          title={
            status !== "approved"
              ? "Approve the organization before enabling AI"
              : aiEnabled
                ? "Disable AI Analysis"
                : "Enable AI Analysis"
          }
          onClick={() => void toggleAi(!aiEnabled)}
          className={cn(
            "relative h-5 w-9 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            aiEnabled ? "bg-violet-500" : "bg-slate-700",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
              aiEnabled ? "left-4" : "left-0.5",
            )}
          />
        </button>
      </label>
      <button
        type="button"
        disabled={deleteLoading}
        onClick={() => void onDelete()}
        className="rounded-md border border-slate-600 bg-slate-800/60 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-red-500/50 hover:bg-red-500/15 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Delete
      </button>
      {error ? <span className="text-center text-[10px] text-red-300">{error}</span> : null}
    </div>
  );
}
