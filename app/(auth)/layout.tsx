import { AuthInfoPanel } from "@/components/auth/auth-info-panel";
import { AuthNavTabs } from "@/components/auth/auth-nav-tabs";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-svh bg-[#0a1226] lg:grid lg:min-h-screen lg:grid-cols-[7fr_3fr]">
      <section className="min-h-svh border-b border-[--color-border] lg:min-h-screen lg:border-b-0 lg:border-r">
        <AuthInfoPanel />
      </section>

      <section className="flex min-h-svh flex-col items-center justify-center bg-gradient-to-b from-[#0a1226] via-[#0c1528] to-[#0a1226] px-4 py-10 sm:px-6 lg:min-h-screen lg:px-8">
        <div className="mb-6 w-full max-w-sm lg:hidden">
          <h1 className="text-center text-xl font-bold text-white">Ring Test Manager</h1>
          <p className="text-center text-xs text-[--color-muted]">IS 1786:2008</p>
        </div>

        <div className="w-full max-w-sm">
          <AuthNavTabs />
          {children}
        </div>
      </section>
    </main>
  );
}
