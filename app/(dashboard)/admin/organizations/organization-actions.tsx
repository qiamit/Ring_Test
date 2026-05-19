"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { OrganizationStatus } from "@/lib/firebase/types";
import { cn } from "@/lib/utils";

import { setOrganizationAction, type OrganizationAction } from "./actions";

const ACTION_OPTIONS: { value: OrganizationAction; label: string }[] = [
  { value: "approved", label: "Approved" },
  { value: "hold", label: "Hold" },
  { value: "rejected", label: "Reject" },
  { value: "delete", label: "Delete" },
];

function statusToAction(status: OrganizationStatus): OrganizationAction | "pending" {
  if (status === "approved") return "approved";
  if (status === "hold") return "hold";
  if (status === "rejected") return "rejected";
  return "pending";
}

export function OrganizationActions({
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

  const currentAction = statusToAction(status);
  const selectValue = currentAction === "pending" ? "" : currentAction;

  async function runAction(action: OrganizationAction, reason?: string) {
    setLoading(true);
    setError(null);
    const res = await setOrganizationAction(tenantId, action, reason);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      if (selectRef.current) {
        selectRef.current.value = selectValue;
      }
      return;
    }
    router.refresh();
  }

  async function onChange(next: string) {
    if (!next || next === selectValue) return;

    const action = next as OrganizationAction;

    if (action === "delete") {
      const confirmed = window.confirm(
        "Delete this organization permanently? This removes the firm record, memberships, and associated tests.",
      );
      if (!confirmed) {
        if (selectRef.current) selectRef.current.value = selectValue;
        return;
      }
    }

    if (action === "rejected") {
      const reason = window.prompt("Rejection reason (optional):") ?? "";
      await runAction(action, reason);
      return;
    }

    await runAction(action);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        key={status}
        ref={selectRef}
        defaultValue={selectValue}
        disabled={loading}
        onChange={(e) => void onChange(e.target.value)}
        className={cn(
          "min-w-[7.5rem] rounded-md border border-[--color-border] bg-slate-900/80 px-2 py-1.5 text-xs font-semibold text-slate-100",
          "focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          status === "pending" && "text-amber-200",
          status === "approved" && "text-emerald-200",
          status === "hold" && "text-orange-200",
          status === "rejected" && "text-red-200",
        )}
        aria-label="Organization action"
      >
        {status === "pending" ? (
          <option value="" disabled>
            Pending — choose action
          </option>
        ) : null}
        {ACTION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
    </div>
  );
}
