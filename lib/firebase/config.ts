export const firebasePublicConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
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
