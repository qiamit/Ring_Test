"use client";

import { createUserWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatFirebaseAuthError } from "@/lib/firebase/auth-errors";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { establishServerSession } from "@/lib/firebase/session-client";
import { SessionAccessError } from "@/lib/firebase/session-errors";

export function SignupForm() {
  const router = useRouter();
  const [firmName, setFirmName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const normalizeEmail = (value: string) => value.trim().toLowerCase();
  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    const normalizedFirm = firmName.trim();
    if (normalizedFirm.length < 2) {
      setError("Enter your organization / firm name.");
      return;
    }
    const normalizedName = fullName.trim();
    if (normalizedName.length < 2) {
      setError("Enter the contact person's full name.");
      return;
    }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(
        getFirebaseAuth(),
        normalizedEmail,
        password,
      );
      await updateProfile(cred.user, { displayName: normalizedName });
      try {
        const { isSuperAdmin } = await establishServerSession({
          firmName: normalizedFirm,
          contactName: normalizedName,
        });
        router.push(isSuperAdmin ? "/admin/dashboard" : "/new-test");
        router.refresh();
      } catch (sessionErr) {
        await signOut(getFirebaseAuth());
        if (sessionErr instanceof SessionAccessError && sessionErr.code === "pending_approval") {
          const params = new URLSearchParams({ email: normalizedEmail });
          router.push(`/registration-submitted?${params.toString()}`);
          return;
        }
        throw sessionErr;
      }
    } catch (err) {
      const msg = (err instanceof Error ? err.message : "").toLowerCase();
      if (msg.includes("email-already-in-use")) {
        setError("An account with this email already exists. Try signing in.");
      } else if (msg.includes("too-many-requests")) {
        setError("Too many signup attempts. Please wait and try again.");
      } else {
        setError(formatFirebaseAuthError(err));
      }
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="firmName" className="label mb-1 block">
          Organization / Firm name
        </label>
        <input
          id="firmName"
          type="text"
          required
          value={firmName}
          onChange={(e) => setFirmName(e.target.value)}
          className="input"
          placeholder="Your company name"
        />
      </div>
      <div>
        <label htmlFor="fullName" className="label mb-1 block">
          Contact person (full name)
        </label>
        <input
          id="fullName"
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="input"
          placeholder="Your full name"
        />
      </div>
      <div>
        <label htmlFor="email" className="label mb-1 block">
          Email
        </label>
        <input
          id="email"
          type="email"
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
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
          placeholder="At least 8 characters"
        />
      </div>
      <div>
        <label htmlFor="confirm" className="label mb-1 block">
          Confirm password
        </label>
        <input
          id="confirm"
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="input"
          placeholder="Re-enter password"
        />
      </div>
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Submitting…" : "Register firm"}
      </button>
    </form>
  );
}
