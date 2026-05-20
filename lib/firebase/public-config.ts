import type { FirebaseOptions } from "firebase/app";

import {
  firebasePublicConfig,
  resolveProjectId,
  resolveStorageBucket,
} from "@/lib/firebase/config";

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/**
 * Firebase web config from server env at request/build time.
 * Use this for client init so App Hosting RUNTIME env vars work (not only BUILD-inlined).
 */
export function getFirebasePublicConfigForRuntime(): FirebaseOptions {
  const projectId = env("NEXT_PUBLIC_FIREBASE_PROJECT_ID") || resolveProjectId();
  return {
    apiKey: env("NEXT_PUBLIC_FIREBASE_API_KEY") || firebasePublicConfig.apiKey,
    authDomain:
      env("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN") ||
      firebasePublicConfig.authDomain ||
      `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: env("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET") || resolveStorageBucket(projectId),
    messagingSenderId:
      env("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID") || firebasePublicConfig.messagingSenderId,
    appId: env("NEXT_PUBLIC_FIREBASE_APP_ID") || firebasePublicConfig.appId,
    measurementId:
      env("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID") || firebasePublicConfig.measurementId,
  };
}

export function isFirebaseWebConfigValid(config: FirebaseOptions): boolean {
  return Boolean(
    config.apiKey?.trim() &&
      config.authDomain?.trim() &&
      config.projectId?.trim() &&
      config.appId?.trim(),
  );
}
