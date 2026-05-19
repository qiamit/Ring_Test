import Link from "next/link";

import { AuthSupportContact } from "@/components/auth/support-contact";

import { SignupForm } from "./form";

export default function SignupPage() {
  return (
    <div className="card overflow-hidden shadow-2xl shadow-blue-950/30">
      <div className="border-b border-[--color-border] bg-gradient-to-r from-blue-600/15 to-cyan-500/10 p-5">
        <h2 className="text-xl font-semibold text-white">Register your firm</h2>
        <p className="mt-1 text-sm text-slate-300">
          Create an organization account. A Super Admin will approve your firm before you can sign
          in and use the software.
        </p>
        <div className="mt-3 space-y-1 text-xs text-slate-300">
          <p>• IS 1786:2008 ring test workflow and printable reports</p>
          <p>• Secure cloud storage for tests and company settings</p>
          <p>• Sign in only after approval</p>
        </div>
      </div>

      <div className="p-6">
        <SignupForm />
        <p className="mt-5 text-center text-sm text-[--color-muted]">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-[--color-accent] hover:underline">
            Sign in
          </Link>
        </p>
        <AuthSupportContact />
      </div>
    </div>
  );
}
