import { getAdminStorage } from "@/lib/firebase/admin";
import { firebasePublicConfig, STORAGE_PREFIXES } from "@/lib/firebase/config";

function getDefaultBucket() {
  return getAdminStorage().bucket(firebasePublicConfig.storageBucket);
}

export function formatStorageError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/billing account.*disabled|billing.*absent|accountDisabled/i.test(msg)) {
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
  const bucket = firebasePublicConfig.storageBucket;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media`;
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
  const objectPath = `${STORAGE_PREFIXES.ringImages}/${userId}/${Date.now()}.png`;
  await uploadBuffer(objectPath, buffer, contentType);
  return objectPath;
}

export async function uploadCompanyLogo(
  userId: string,
  buffer: Buffer,
  contentType: string,
  ext: string,
): Promise<string> {
  const safeExt = ext.replace(/[^a-z0-9]/g, "") || "png";
  const objectPath = `${STORAGE_PREFIXES.companyLogos}/${userId}/logo-${Date.now()}.${safeExt}`;
  await uploadBuffer(objectPath, buffer, contentType);
  return objectPath;
}

export function ringImagePublicUrl(objectPath: string): string {
  return getPublicStorageUrl(objectPath);
}

export function companyLogoPublicUrl(objectPath: string): string {
  return getPublicStorageUrl(objectPath);
}
