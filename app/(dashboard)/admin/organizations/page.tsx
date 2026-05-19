import Link from "next/link";

import { listOrganizations } from "@/lib/firebase/organization";
import type { OrganizationStatus } from "@/lib/firebase/types";
import { cn, formatDate } from "@/lib/utils";

import { OrganizationActions } from "./organization-actions";

const FILTERS: { value: OrganizationStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "hold", label: "Hold" },
  { value: "rejected", label: "Rejected" },
];

function statusBadgeClass(status: OrganizationStatus): string {
  switch (status) {
    case "pending":
      return "bg-amber-500/15 text-amber-200 ring-amber-500/30";
    case "approved":
      return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30";
    case "hold":
      return "bg-orange-500/15 text-orange-200 ring-orange-500/30";
    case "rejected":
      return "bg-red-500/15 text-red-200 ring-red-500/30";
  }
}

export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const filter = params.status as OrganizationStatus | "all" | undefined;
  const activeFilter =
    filter && ["pending", "approved", "hold", "rejected"].includes(filter) ? filter : "all";

  const organizations = await listOrganizations(
    activeFilter === "all" ? undefined : { status: activeFilter },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Organizations</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          Approve or reject firm registrations before they can use the application.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const href =
            f.value === "all"
              ? "/admin/organizations"
              : `/admin/organizations?status=${f.value}`;
          const active = activeFilter === f.value;
          return (
            <Link
              key={f.value}
              href={href}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                active
                  ? "border-blue-500/50 bg-blue-600/20 text-blue-200"
                  : "border-[--color-border] text-[--color-muted] hover:bg-slate-800 hover:text-white",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[--color-border] text-xs uppercase text-[--color-muted]">
                <th className="px-4 py-3">Firm</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {organizations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[--color-muted]">
                    No organizations found.
                  </td>
                </tr>
              ) : (
                organizations.map((org) => (
                  <tr key={org.id} className="border-t border-[--color-border]">
                    <td className="px-4 py-3 font-medium text-white">{org.name}</td>
                    <td className="px-4 py-3 text-slate-300">{org.contact_name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-300">{org.owner_email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1",
                          statusBadgeClass(org.status),
                        )}
                      >
                        {org.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatDate(org.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <OrganizationActions tenantId={org.id} status={org.status} />
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
