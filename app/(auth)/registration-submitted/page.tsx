import Link from "next/link";

import { AuthSupportContact } from "@/components/auth/support-contact";

export default async function RegistrationSubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = params.email?.trim();

  return (
    <div className="card p-6 shadow-2xl shadow-blue-950/30">
      <h2 className="text-xl font-semibold text-white">Registration submitted</h2>
      <p className="mt-3 text-sm text-slate-300">
        Your firm has been registered and is waiting for Super Admin approval.
        {email ? (
          <>
            {" "}
            We received the request for <span className="font-medium text-white">{email}</span>.
          </>
        ) : null}
      </p>
      <p className="mt-3 text-sm text-[--color-muted]">
        You will be able to sign in and use Ring Test Manager after your organization is approved.
      </p>
      <Link href="/login" className="btn-primary mt-6 inline-flex w-full justify-center">
        Go to sign in
      </Link>
      <AuthSupportContact />
    </div>
  );
}
