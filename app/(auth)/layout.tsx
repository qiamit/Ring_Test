export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a1226] via-[#0e1a30] to-[#0a1226] p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">Ring Test Manager</h1>
          <p className="text-sm text-[--color-muted]">IS 1786:2008 — Reinforcement steel ring test</p>
        </div>
        {children}
      </div>
    </main>
  );
}
