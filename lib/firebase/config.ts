const DEFAULT_PROJECT_ID = "ring-test-manager";

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/** Default Firebase Storage bucket for this project (new Firebase projects use .firebasestorage.app). */
export function resolveStorageBucket(projectId = resolveProjectId()): string {
  const fromEnv = env("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
  if (fromEnv) return fromEnv;
  return `${projectId}.firebasestorage.app`;
}

export function resolveProjectId(): string {
  return env("NEXT_PUBLIC_FIREBASE_PROJECT_ID") || DEFAULT_PROJECT_ID;
}

export const firebasePublicConfig = {
  apiKey: env("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: env("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN") || `${resolveProjectId()}.firebaseapp.com`,
  projectId: resolveProjectId(),
  storageBucket: resolveStorageBucket(),
  messagingSenderId: env("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("NEXT_PUBLIC_FIREBASE_APP_ID"),
  measurementId: env("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID") || undefined,
};

export const SESSION_COOKIE_NAME = "__session";
export const SESSION_MAX_AGE_MS = 60 * 60 * 24 * 14 * 1000; // 14 days

export const APP_OWNER_EMAIL =
  (process.env.APP_OWNER_EMAIL ?? "qicoding1@gmail.com").trim().toLowerCase();

/** Path prefixes inside the default Storage bucket (see storage.rules). */
export const STORAGE_PREFIXES = {
  ringImages: "ring-images",
  companyLogos: "company-logos",
} as const;
