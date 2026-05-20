"use client";

import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

import { firebasePublicConfig } from "@/lib/firebase/config";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;

export class FirebaseClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseClientError";
  }
}

export function isFirebaseClientReady(): boolean {
  return !!app;
}

/** Initialize the browser Firebase app from server-provided config (runtime env). */
export function ensureFirebaseClient(config: FirebaseOptions): FirebaseApp {
  if (app) return app;
  const apiKey = config.apiKey?.trim();
  if (!apiKey) {
    throw new FirebaseClientError(
      "Firebase API key is missing. In Firebase Console → App Hosting → Environment, set NEXT_PUBLIC_FIREBASE_API_KEY with BUILD and RUNTIME enabled, then create a new rollout.",
    );
  }
  app = getApps().length ? getApp() : initializeApp(config);
  return app;
}

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    if (firebasePublicConfig.apiKey?.trim()) {
      return ensureFirebaseClient(firebasePublicConfig);
    }
    throw new FirebaseClientError("Firebase client is not initialized.");
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

export function getFirebaseFirestore(): Firestore {
  if (!db) db = getFirestore(getFirebaseApp());
  return db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) storage = getStorage(getFirebaseApp());
  return storage;
}
