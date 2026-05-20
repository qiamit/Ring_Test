import { AuthSupportContact } from "@/components/auth/support-contact";

import { LoginForm } from "./form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}) {
  return (
    <div className="card p-6 shadow-2xl shadow-blue-950/30">
      <h2 className="mb-1 text-xl font-semibold text-white">Sign In</h2>
      <p className="mb-5 text-sm text-[--color-muted]">
        Sign in after your organization has been approved by the Super Admin.
      </p>
      <LoginForm searchParamsPromise={searchParams} />
      <AuthSupportContact />
    </div>
  );
}
