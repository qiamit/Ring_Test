import Link from "next/link";

import { getAdminDashboardStats } from "@/lib/firebase/organization";
import { cn } from "@/lib/utils";

export default async function AdminDashboardPage() {
  const stats = await getAdminDashboardStats();

  const cards = [
    {
      label: "Pending approval",
      value: stats.pending,
      href: "/admin/organizations?status=pending",
      accent: "text-amber-200",
    },
    {
      label: "Approved organizations",
      value: stats.approved,
      href: "/admin/organizations?status=approved",
      accent: "text-emerald-200",
    },
    {
      label: "On hold",
      value: stats.hold,
      href: "/admin/organizations?status=hold",
      accent: "text-orange-200",
    },
    {
      label: "Rejected",
      value: stats.rejected,
      href: "/admin/organizations?status=rejected",
      accent: "text-red-200",
    },
    {
      label: "Total organizations",
      value: stats.totalOrganizations,
      href: "/admin/organizations",
      accent: "text-blue-200",
    },
    {
      label: "Total tests (all firms)",
      value: stats.totalTests,
      href: "/reports",
      accent: "text-slate-200",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Super Admin Dashboard</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          Overview of registered firms and platform activity.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="card block p-5 transition-colors hover:border-blue-500/40"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-[--color-muted]">
              {card.label}
            </div>
            <div className={cn("mt-2 text-3xl font-bold", card.accent)}>{card.value}</div>
          </Link>
        ))}
      </div>

      {stats.pending > 0 ? (
        <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-300">
            <span className="font-semibold text-amber-200">{stats.pending}</span> organization
            {stats.pending === 1 ? "" : "s"} waiting for approval.
          </p>
          <Link href="/admin/organizations?status=pending" className="btn-primary shrink-0">
            Review pending
          </Link>
        </div>
      ) : null}
    </div>
  );
}
