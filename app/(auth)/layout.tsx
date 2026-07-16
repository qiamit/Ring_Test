import { AuthInfoPanel } from "@/components/auth/auth-info-panel";
import { AuthNavTabs } from "@/components/auth/auth-nav-tabs";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#0a1226] lg:grid lg:min-h-dvh lg:grid-cols-[minmax(0,7fr)_minmax(20rem,3fr)]">
      {/* Marketing panel: desktop / large tablet landscape only */}
      <section className="hidden min-h-0 overflow-y-auto border-[--color-border] lg:block lg:border-r">
        <AuthInfoPanel />
      </section>

      {/* Auth form: fills the screen on phone / tablet */}
      <section className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-[#0a1226] via-[#0c1528] to-[#0a1226] px-4 py-6 safe-area-pad sm:px-6 sm:py-8 lg:min-h-dvh lg:overflow-y-auto lg:px-8 lg:py-10">
        <div className="mb-5 w-full max-w-md text-center lg:hidden">
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-bold text-white">
            R
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Ring Test Manager
          </h1>
          <p className="mt-1 text-xs text-[--color-muted] sm:text-sm">IS 1786:2008</p>
        </div>

        <div className="w-full max-w-md">
          <AuthNavTabs />
          {children}
        </div>
      </section>
    </main>
  );
}
