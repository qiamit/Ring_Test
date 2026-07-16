import { CircleHelp, FileText, FlaskConical, ShieldCheck } from "lucide-react";

const FEATURES = [
  {
    icon: FlaskConical,
    title: "Ring Test Workflow",
    description: "Guided capture, thickness analysis, and automated pass/fail per IS 1786:2008.",
  },
  {
    icon: FileText,
    title: "Printable Report",
    description: "A4-ready reports with branding, observations, and area measurements.",
  },
  {
    icon: ShieldCheck,
    title: "Secure Multi Tenant",
    description: "Isolated firm workspaces with Super Admin approval before access.",
  },
  {
    icon: CircleHelp,
    title: "Per-test Scale",
    description: "Draw mm/px on each image so diameter and thickness stay accurate.",
  },
];

const HIGHLIGHTS = [
  { label: "Standard", value: "IS 1786:2008" },
  { label: "Platform", value: "Cloud SaaS" },
  { label: "Reports", value: "Print - Ready" },
];

export function AuthInfoPanel() {
  return (
    <div className="relative flex h-full min-h-dvh w-full flex-col overflow-hidden bg-[#070d18]">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-600/10 via-transparent to-cyan-500/5"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-32 top-1/4 h-[28rem] w-[28rem] rounded-full bg-blue-600/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-cyan-500/8 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
        aria-hidden
      />

      <div className="relative flex min-h-0 flex-1 flex-col px-8 py-10 lg:px-12 lg:py-12 xl:px-16 xl:py-14">
        <header className="shrink-0 border-b border-white/10 pb-6 xl:pb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-xs font-medium tracking-wide text-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            Reinforcement Steel Testing
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-white xl:mt-6 xl:text-4xl 2xl:text-[2.75rem] 2xl:leading-tight">
            Ring Test Manager
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300/95 xl:mt-4 xl:text-lg">
            Enterprise-grade workflow for laboratories and testing firms — measure, validate, and
            report ring specimens in line with{" "}
            <span className="font-semibold text-white">IS 1786:2008</span>.
          </p>

          <dl className="mt-6 flex flex-wrap gap-3 xl:mt-8">
            {HIGHLIGHTS.map(({ label, value }) => (
              <div
                key={label}
                className="min-w-[7rem] flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 backdrop-blur-sm sm:min-w-[7.5rem] sm:flex-none sm:px-4 sm:py-3"
              >
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {label}
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-slate-100">{value}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="flex min-h-0 flex-1 flex-col justify-center py-6 xl:py-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Capabilities
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:mt-5 xl:gap-4">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <li
                key={title}
                className="group rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-4 transition-colors hover:border-blue-500/30 hover:bg-white/[0.05] xl:p-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20 text-blue-300 ring-1 ring-blue-500/25 xl:h-11 xl:w-11">
                  <Icon size={22} strokeWidth={1.75} />
                </span>
                <p className="mt-3 text-sm font-semibold text-white xl:mt-4 xl:text-base">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400 xl:mt-1.5 xl:text-sm">
                  {description}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <footer className="mt-auto shrink-0 border-t border-white/10 pt-6 xl:pt-8">
          <p className="text-sm leading-relaxed text-slate-500">
            Register your organization, await Super Admin approval, then sign in to run tests and
            manage settings and reports from one workspace.
          </p>
          <p className="mt-3 text-xs text-slate-600">
            © {new Date().getFullYear()} Ring Test Manager · Quality assurance for reinforcement
            steel
          </p>
        </footer>
      </div>
    </div>
  );
}
