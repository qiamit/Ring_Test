"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CircleHelp,
  FileText,
  FlaskConical,
  LayoutDashboard,
  PencilRuler,
  Settings,
} from "lucide-react";

import { SignOutButton } from "@/components/nav/sign-out-button";
import { cn } from "@/lib/utils";

const FIRM_NAV = [
  { href: "/new-test", label: "New Test", icon: FlaskConical },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/calibration", label: "Validation & Calibration", icon: PencilRuler },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: CircleHelp },
];

const ADMIN_NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
];

function NavLinks({
  items,
  pathname,
}: {
  items: typeof FIRM_NAV;
  pathname: string;
}) {
  return items.map(({ href, label, icon: Icon }) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-blue-600/20 text-blue-200 ring-1 ring-blue-500/40"
            : "text-[--color-muted] hover:bg-slate-800 hover:text-white",
        )}
      >
        <Icon size={16} className="shrink-0" />
        <span>{label}</span>
      </Link>
    );
  });
}

export function Sidebar({
  email,
  fullName,
  isSuperAdmin,
}: {
  email: string | null;
  fullName?: string | null;
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const homeHref = isSuperAdmin ? "/admin/dashboard" : "/new-test";

  return (
    <aside className="no-print hidden min-h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-[--color-border] bg-[--color-surface] p-4 lg:flex">
      <Link href={homeHref} className="mb-6 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-bold text-white">
          R
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight text-white">Ring Test Manager</div>
          <div className="text-[10px] uppercase tracking-wider text-[--color-muted]">
            IS 1786:2008
          </div>
        </div>
      </Link>
      <nav className="flex flex-1 flex-col gap-1">
        {isSuperAdmin ? (
          <>
            <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-[--color-muted]">
              Super Admin
            </div>
            <NavLinks items={ADMIN_NAV} pathname={pathname} />
            <div className="my-2 border-t border-[--color-border]" />
            <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-[--color-muted]">
              Application
            </div>
            <NavLinks items={FIRM_NAV} pathname={pathname} />
          </>
        ) : (
          <NavLinks items={FIRM_NAV} pathname={pathname} />
        )}
      </nav>
      <div className="mt-4 border-t border-[--color-border] pt-4">
        <div className="mb-2 text-xs text-[--color-muted]">Signed in as</div>
        {fullName ? (
          <div className="mb-2 rounded-md border border-[--color-border] bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-100">
            {fullName}
          </div>
        ) : null}
        <div className="mb-3 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-200">
          {email ?? "—"}
        </div>
        <SignOutButton className="btn-ghost w-full justify-center text-xs" />
      </div>
    </aside>
  );
}

export function MobileSidebar({ isSuperAdmin }: { isSuperAdmin?: boolean }) {
  const pathname = usePathname();
  const items = isSuperAdmin ? [...ADMIN_NAV, ...FIRM_NAV] : FIRM_NAV;

  return (
    <nav className="no-print lg:hidden">
      <div className="flex gap-2 overflow-x-auto p-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "border-blue-500/50 bg-blue-600/20 text-blue-200"
                  : "border-[--color-border] bg-[--color-surface] text-[--color-muted] hover:bg-slate-800 hover:text-white",
              )}
            >
              <Icon size={14} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
