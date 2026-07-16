import { getAdminDb } from "@/lib/firebase/admin";
import type { AiConfigPublic, AiConfigRecord, AiProviderId } from "@/lib/firebase/types";

import { decryptApiKey, encryptApiKey, isEncryptedApiKey } from "@/lib/ai/crypto";

const DOC_PATH = { collection: "app_config", id: "ai" } as const;

const db = () => getAdminDb();

function maskKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  // Don't mask encrypted blob as if it were a key
  if (isEncryptedApiKey(trimmed)) return "••••enc";
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}

function toPublic(row: AiConfigRecord | null, decryptedHintKey?: string): AiConfigPublic {
  if (!row) {
    return {
      provider: "openai",
      name: "",
      model_id: "",
      api_key_set: false,
      api_key_hint: null,
      updated_at: null,
    };
  }
  const hintSource = decryptedHintKey ?? (isEncryptedApiKey(row.api_key) ? "" : row.api_key);
  return {
    provider: row.provider,
    name: row.name,
    model_id: row.model_id,
    api_key_set: Boolean(row.api_key?.trim()),
    api_key_hint: row.api_key?.trim()
      ? maskKey(hintSource || (isEncryptedApiKey(row.api_key) ? "xxxx" : row.api_key))
      : null,
    updated_at: row.updated_at,
  };
}

export async function getAiConfig(): Promise<AiConfigRecord | null> {
  const doc = await db().collection(DOC_PATH.collection).doc(DOC_PATH.id).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  const storedKey = (data.api_key as string) ?? "";
  let apiKey = storedKey;
  try {
    apiKey = await decryptApiKey(storedKey);
  } catch {
    // If decrypt fails (missing key env), leave encrypted string — callers will fail clearly.
    apiKey = storedKey;
  }
  return {
    provider: (data.provider as AiProviderId) ?? "openai",
    name: (data.name as string) ?? "",
    model_id: (data.model_id as string) ?? "",
    api_key: apiKey,
    updated_at: (data.updated_at as string) ?? "",
    updated_by: (data.updated_by as string | null) ?? null,
  };
}

/** Raw Firestore row (may still be encrypted). */
async function getAiConfigRaw(): Promise<AiConfigRecord | null> {
  const doc = await db().collection(DOC_PATH.collection).doc(DOC_PATH.id).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    provider: (data.provider as AiProviderId) ?? "openai",
    name: (data.name as string) ?? "",
    model_id: (data.model_id as string) ?? "",
    api_key: (data.api_key as string) ?? "",
    updated_at: (data.updated_at as string) ?? "",
    updated_by: (data.updated_by as string | null) ?? null,
  };
}

export async function getAiConfigPublic(): Promise<AiConfigPublic> {
  const raw = await getAiConfigRaw();
  if (!raw) return toPublic(null);
  let hintKey = "";
  if (raw.api_key && !isEncryptedApiKey(raw.api_key)) {
    hintKey = raw.api_key;
  } else if (raw.api_key) {
    try {
      hintKey = await decryptApiKey(raw.api_key);
    } catch {
      hintKey = "";
    }
  }
  return toPublic(raw, hintKey);
}

export async function upsertAiConfig(input: {
  provider: AiProviderId;
  name: string;
  model_id: string;
  /** Pass empty string to keep the existing key. */
  api_key: string;
  updated_by: string;
}): Promise<AiConfigPublic> {
  const existing = await getAiConfigRaw();
  let nextKeyPlain = input.api_key.trim();
  if (!nextKeyPlain && existing?.api_key) {
    try {
      nextKeyPlain = await decryptApiKey(existing.api_key);
    } catch {
      // Keep existing encrypted blob if we cannot decrypt and no new key provided
      nextKeyPlain = "";
    }
  }

  let storedKey: string;
  if (nextKeyPlain) {
    storedKey = await encryptApiKey(nextKeyPlain);
  } else if (existing?.api_key) {
    // Migrate plaintext → encrypted on save even when key unchanged
    storedKey = isEncryptedApiKey(existing.api_key)
      ? existing.api_key
      : await encryptApiKey(existing.api_key);
  } else {
    storedKey = "";
  }

  const row: AiConfigRecord = {
    provider: input.provider,
    name: input.name.trim(),
    model_id: input.model_id.trim(),
    api_key: storedKey,
    updated_at: new Date().toISOString(),
    updated_by: input.updated_by,
  };
  await db().collection(DOC_PATH.collection).doc(DOC_PATH.id).set(row, { merge: true });
  return toPublic(row, nextKeyPlain || undefined);
}

export async function isAiConfigReady(): Promise<boolean> {
  const cfg = await getAiConfig();
  if (!cfg?.provider || !cfg.model_id?.trim()) return false;
  if (!cfg.api_key?.trim()) return false;
  if (isEncryptedApiKey(cfg.api_key)) return false; // decrypt failed
  return true;
}
