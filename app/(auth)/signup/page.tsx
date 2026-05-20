import { AuthSupportContact } from "@/components/auth/support-contact";

import { SignupForm } from "./form";

export default function SignupPage() {
  return (
    <div className="card p-6 shadow-2xl shadow-blue-950/30">
      <h2 className="mb-1 text-xl font-semibold text-white">Register your firm</h2>
      <p className="mb-5 text-sm text-[--color-muted]">
        Create an organization account. A Super Admin will approve your firm before you can sign in.
      </p>
      <SignupForm />
      <AuthSupportContact />
    </div>
  );
}
