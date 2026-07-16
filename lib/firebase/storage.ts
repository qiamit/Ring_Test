import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

import { getAdminStorage } from "@/lib/firebase/admin";
import {
  firebasePublicConfig,
  resolveStorageBucket,
  STORAGE_PREFIXES,
} from "@/lib/firebase/config";

const LOCAL_UPLOAD_PREFIX = "local-uploads";

function getDefaultBucket() {
  const bucketName = resolveStorageBucket(firebasePublicConfig.projectId);
  return getAdminStorage().bucket(bucketName);
}

function isBillingDisabledError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /billing account.*disabled|billing.*absent|accountDisabled|state delinquent/i.test(
    msg,
  );
}

function isLocalUploadPath(objectPath: string): boolean {
  return objectPath.startsWith(`${LOCAL_UPLOAD_PREFIX}/`);
}

function allowLocalFallback(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_UPLOAD_FALLBACK === "1";
}

export function formatStorageError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/delinquent|billing account.*disabled|accountDisabled/i.test(msg)) {
    return (
      "Google Cloud billing account is disabled (delinquent / payment issue). " +
      "Open https://console.cloud.google.com/billing?project=ring-test-manager → " +
      "fix payment method or pay outstanding balance, then retry Save. " +
      "See: https://cloud.google.com/billing/docs/how-to/resolve-issues"
    );
  }
  if (/billing.*absent|billing account/i.test(msg)) {
    return (
      "Firebase Storage needs an active billing account. In Firebase Console open ring-test-manager → " +
      "Upgrade (Blaze plan) and link a billing account, then retry. " +
      "You are only charged if usage exceeds free limits."
    );
  }
  if (/bucket.*not exist|404|Not Found/i.test(msg)) {
    return (
      "Storage bucket not found. Enable Storage in Firebase Console for project ring-test-manager."
    );
  }
  return msg;
}

export function getPublicStorageUrl(objectPath: string): string {
  if (isLocalUploadPath(objectPath)) {
    return `/${objectPath.replace(/\\/g, "/")}`;
  }
  const bucket = resolveStorageBucket(firebasePublicConfig.projectId);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

async function saveLocalUpload(objectPath: string, buffer: Buffer): Promise<void> {
  const abs = path.join(process.cwd(), "public", objectPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
}

export async function uploadBuffer(
  objectPath: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const file = getDefaultBucket().file(objectPath);
  await file.save(buffer, {
    metadata: { contentType },
    resumable: false,
  });
}

export async function deleteStorageObject(objectPath: string): Promise<void> {
  if (isLocalUploadPath(objectPath)) {
    try {
      await unlink(path.join(process.cwd(), "public", objectPath));
    } catch {
      /* ignore missing */
    }
    return;
  }
  try {
    await getDefaultBucket().file(objectPath).delete();
  } catch {
    // ignore missing files
  }
}

export async function uploadRingImage(
  userId: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const cloudPath = `${STORAGE_PREFIXES.ringImages}/${userId}/${Date.now()}.png`;
  try {
    await uploadBuffer(cloudPath, buffer, contentType);
    return cloudPath;
  } catch (err) {
    if (isBillingDisabledError(err) && allowLocalFallback()) {
      console.warn(
        "[storage] Cloud Storage billing blocked — saving ring image locally under public/local-uploads/",
      );
      const localPath = `${LOCAL_UPLOAD_PREFIX}/${STORAGE_PREFIXES.ringImages}/${userId}/${Date.now()}.png`;
      await saveLocalUpload(localPath, buffer);
      return localPath;
    }
    throw err;
  }
}

export async function uploadCompanyLogo(
  userId: string,
  buffer: Buffer,
  contentType: string,
  ext: string,
): Promise<string> {
  const safeExt = ext.replace(/[^a-z0-9]/g, "") || "png";
  const cloudPath = `${STORAGE_PREFIXES.companyLogos}/${userId}/logo-${Date.now()}.${safeExt}`;
  try {
    await uploadBuffer(cloudPath, buffer, contentType);
    return cloudPath;
  } catch (err) {
    if (isBillingDisabledError(err) && allowLocalFallback()) {
      console.warn(
        "[storage] Cloud Storage billing blocked — saving logo locally under public/local-uploads/",
      );
      const localPath = `${LOCAL_UPLOAD_PREFIX}/${STORAGE_PREFIXES.companyLogos}/${userId}/logo-${Date.now()}.${safeExt}`;
      await saveLocalUpload(localPath, buffer);
      return localPath;
    }
    throw err;
  }
}

export function ringImagePublicUrl(objectPath: string): string {
  return getPublicStorageUrl(objectPath);
}

export function companyLogoPublicUrl(objectPath: string): string {
  return getPublicStorageUrl(objectPath);
}
