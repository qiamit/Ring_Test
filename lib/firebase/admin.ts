import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

import { firebasePublicConfig } from "@/lib/firebase/config";

let adminApp: App;

function loadServiceAccount(): Record<string, string> | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    try {
      return JSON.parse(json) as Record<string, string>;
    } catch {
      return null;
    }
  }
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (clientEmail && privateKey) {
    return {
      project_id: firebasePublicConfig.projectId,
      client_email: clientEmail,
      private_key: privateKey,
    };
  }
  return null;
}

export function getAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps();
  if (existing.length) {
    adminApp = existing[0]!;
    return adminApp;
  }

  const serviceAccount = loadServiceAccount();
  if (serviceAccount) {
    adminApp = initializeApp({
      credential: cert(serviceAccount as Parameters<typeof cert>[0]),
      storageBucket: firebasePublicConfig.storageBucket,
    });
  } else {
    // Uses Application Default Credentials when deployed on Firebase / GCP
    adminApp = initializeApp({
      projectId: firebasePublicConfig.projectId,
      storageBucket: firebasePublicConfig.storageBucket,
    });
  }
  return adminApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminStorage(): Storage {
  return getStorage(getAdminApp());
}
