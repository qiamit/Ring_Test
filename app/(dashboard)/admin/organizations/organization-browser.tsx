"use client";

import { useMemo, useState } from "react";

import type { OrganizationStatus, TenantRecord } from "@/lib/firebase/types";
import { formatDate } from "@/lib/utils";

import { OrganizationActions, OrganizationStatusSelect } from "./organization-actions";

const FILTERS: { value: OrganizationStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "hold", label: "Hold" },
  { value: "rejected", label: "Rejected" },
];

type OrgRow = Pick<
  TenantRecord,
  "id" | "name" | "contact_name" | "owner_email" | "status" | "created_at" | "ai_enabled"
>;

export function OrganizationBrowser({ organizations }: { organizations: OrgRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrganizationStatus | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return organizations.filter((org) => {
      if (statusFilter !== "all" && org.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [org.name, org.contact_name, org.owner_email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [organizations, query, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search firm, contact, email…"
          className="min-w-[14rem] flex-1 rounded-md border border-[--color-border] bg-slate-950 px-3 py-1.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500/60"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrganizationStatus | "all")}
          className="rounded-md border border-[--color-border] bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-blue-500/60"
          aria-label="Filter by status"
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-900/50 text-xs uppercase tracking-wide text-[--color-muted]">
                <th className="border border-[--color-border] px-3 py-3 text-left font-semibold">
                  Firm
                </th>
                <th className="border border-[--color-border] px-3 py-3 text-center font-semibold">
                  Contact
                </th>
                <th className="border border-[--color-border] px-3 py-3 text-center font-semibold">
                  Email
                </th>
                <th className="border border-[--color-border] px-3 py-3 text-center font-semibold">
                  Status
                </th>
                <th className="border border-[--color-border] px-3 py-3 text-center font-semibold">
                  Registered
                </th>
                <th className="border border-[--color-border] px-3 py-3 text-center font-semibold">
                  AI / Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="border border-[--color-border] px-4 py-8 text-center text-[--color-muted]"
                  >
                    No organizations found.
                  </td>
                </tr>
              ) : (
                filtered.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-900/30">
                    <td className="border border-[--color-border] px-3 py-3 text-left font-medium text-white">
                      {org.name}
                    </td>
                    <td className="border border-[--color-border] px-3 py-3 text-center text-slate-300">
                      {org.contact_name ?? "—"}
                    </td>
                    <td className="border border-[--color-border] px-3 py-3 text-center text-slate-300">
                      <span className="inline-block max-w-[14rem] truncate align-middle">
                        {org.owner_email ?? "—"}
                      </span>
                    </td>
                    <td className="border border-[--color-border] px-3 py-3 text-center align-middle">
                      <OrganizationStatusSelect tenantId={org.id} status={org.status} />
                    </td>
                    <td className="border border-[--color-border] px-3 py-3 text-center text-slate-400">
                      {formatDate(org.created_at)}
                    </td>
                    <td className="border border-[--color-border] px-3 py-3 text-center align-middle">
                      <OrganizationActions
                        tenantId={org.id}
                        status={org.status}
                        aiEnabled={org.ai_enabled}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
