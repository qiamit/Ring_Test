import { AuthSupportContact } from "@/components/auth/support-contact";

import { SignupForm } from "./form";

export default function SignupPage() {
  return (
    <div className="card p-4 shadow-2xl shadow-blue-950/30 sm:p-6">
      <h2 className="mb-1 text-lg font-semibold text-white sm:text-xl">Register your firm</h2>
      <p className="mb-4 text-sm text-[--color-muted] sm:mb-5">
        Create an organization account. A Super Admin will approve your firm before you can sign in.
      </p>
      <SignupForm />
      <AuthSupportContact />
    </div>
  );
}
