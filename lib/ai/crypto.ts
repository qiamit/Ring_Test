/**
 * AES-GCM encryption for AI API keys at rest.
 * Requires server-only AI_CONFIG_ENCRYPTION_KEY (32+ char secret or 64 hex).
 */

const ENC_PREFIX = "enc:v1:";

function getRawKeyMaterial(): string | null {
  const key = process.env.AI_CONFIG_ENCRYPTION_KEY?.trim();
  return key && key.length >= 16 ? key : null;
}

async function importKey(): Promise<CryptoKey | null> {
  const material = getRawKeyMaterial();
  if (!material) return null;

  const enc = new TextEncoder();
  let keyBytes: Uint8Array;
  if (/^[0-9a-fA-F]{64}$/.test(material)) {
    keyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      keyBytes[i] = parseInt(material.slice(i * 2, i * 2 + 2), 16);
    }
  } else {
    const hash = await crypto.subtle.digest("SHA-256", enc.encode(material));
    keyBytes = new Uint8Array(hash);
  }

  return crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isEncryptedApiKey(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

/** Encrypt plaintext API key. Falls back to plaintext if no encryption key configured. */
export async function encryptApiKey(plaintext: string): Promise<string> {
  const trimmed = plaintext.trim();
  if (!trimmed) return "";
  if (isEncryptedApiKey(trimmed)) return trimmed;

  const key = await importKey();
  if (!key) return trimmed;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(trimmed),
  );
  const packed = new Uint8Array(iv.length + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  return ENC_PREFIX + toBase64(packed);
}

/** Decrypt stored API key. Plaintext legacy values pass through. */
export async function decryptApiKey(stored: string): Promise<string> {
  const trimmed = stored.trim();
  if (!trimmed) return "";
  if (!isEncryptedApiKey(trimmed)) return trimmed;

  const key = await importKey();
  if (!key) {
    throw new Error("AI_CONFIG_ENCRYPTION_KEY is required to decrypt stored API keys.");
  }

  const packed = fromBase64(trimmed.slice(ENC_PREFIX.length));
  if (packed.length < 13) throw new Error("Invalid encrypted API key.");
  const iv = packed.slice(0, 12);
  const data = packed.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plain);
}

export function encryptionConfigured(): boolean {
  return Boolean(getRawKeyMaterial());
}
