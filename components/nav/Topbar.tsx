import { SignOutButton } from "@/components/nav/sign-out-button";

export function Topbar() {
  return (
    <header className="no-print flex items-center justify-between gap-3 border-b border-[--color-border] bg-[--color-surface]/70 px-3 py-2.5 backdrop-blur sm:px-4 sm:py-3 lg:px-8">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white lg:hidden">Ring Test Manager</div>
        <div className="hidden text-xs uppercase tracking-wider text-[--color-muted] lg:block">
          Ring Test Manager
        </div>
        <div className="text-[10px] uppercase tracking-wider text-[--color-muted] lg:hidden">
          IS 1786:2008
        </div>
      </div>
      <div className="lg:hidden">
        <SignOutButton className="btn-ghost shrink-0 px-2 py-1.5 text-xs" />
      </div>
    </header>
  );
}
