"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/login", label: "Sign In" },
  { href: "/signup", label: "Sign Up" },
] as const;

export function AuthNavTabs() {
  const pathname = usePathname();

  if (pathname.startsWith("/registration-submitted")) {
    return null;
  }

  return (
    <nav
      className="mb-4 flex rounded-lg border border-[--color-border] bg-slate-900/50 p-1"
      aria-label="Authentication"
    >
      {TABS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-center text-sm font-semibold transition-colors",
              active
                ? "bg-blue-600/25 text-blue-100 ring-1 ring-blue-500/40"
                : "text-[--color-muted] hover:bg-slate-800/60 hover:text-white",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
