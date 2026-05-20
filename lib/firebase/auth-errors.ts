import { FirebaseClientError } from "@/lib/firebase/client";

export function formatFirebaseAuthError(err: unknown): string {
  if (err instanceof FirebaseClientError) return err.message;

  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";

  if (code === "auth/invalid-api-key") {
    return (
      "Firebase API key is invalid or missing on the server. In Firebase Console → App Hosting → " +
      "ring-manager-backend → Environment, set NEXT_PUBLIC_FIREBASE_API_KEY (and other NEXT_PUBLIC_FIREBASE_* " +
      "variables) with both BUILD and RUNTIME checked, then create a new rollout."
    );
  }

  return err instanceof Error ? err.message : "Authentication failed";
}
