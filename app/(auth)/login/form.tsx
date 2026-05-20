"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { getFirebaseAuth } from "@/lib/firebase/client";
import { establishServerSession } from "@/lib/firebase/session-client";
import { SessionAccessError } from "@/lib/firebase/session-errors";

const ERROR_MESSAGES: Record<string, string> = {
  pending: "Your organization is awaiting Super Admin approval. Please try again after approval.",
  rejected: "Your organization registration was not approved. Please contact support.",
};

export function LoginForm({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ error?: string; redirectTo?: string }>;
}) {
  const params = use(searchParamsPromise);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.error ? (ERROR_MESSAGES[params.error] ?? null) : null,
  );
  const [loading, setLoading] = useState(false);
  const normalizeEmail = (value: string) => value.trim().toLowerCase();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), normalizeEmail(email), password);
      const { isSuperAdmin } = await establishServerSession();
      const target = isSuperAdmin
        ? "/admin/dashboard"
        : (params.redirectTo ?? "/new-test");
      router.push(target);
      router.refresh();
    } catch (err) {
      if (err instanceof SessionAccessError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Sign in failed");
      }
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="label mb-1 block">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          placeholder="you@company.com"
        />
      </div>
      <div>
        <label htmlFor="password" className="label mb-1 block">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
          placeholder="••••••••"
        />
      </div>
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}
