import { AuthSupportContact } from "@/components/auth/support-contact";

import { LoginForm } from "./form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}) {
  return (
    <div className="card p-4 shadow-2xl shadow-blue-950/30 sm:p-6">
      <h2 className="mb-1 text-lg font-semibold text-white sm:text-xl">Sign In</h2>
      <p className="mb-4 text-sm text-[--color-muted] sm:mb-5">
        Sign in after your organization has been approved by the Super Admin.
      </p>
      <LoginForm searchParamsPromise={searchParams} />
      <AuthSupportContact />
    </div>
  );
}
