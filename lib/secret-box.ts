import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption for secrets held in Convex — OAuth access tokens and BYOK provider
 * API keys.
 *
 * Context: Convex documents are readable by anything that can reach the deployment, and the
 * deployment URL is public (`NEXT_PUBLIC_CONVEX_URL`). Encrypting at rest means a read of the
 * `userIntegrations` or `aiSettings` tables yields ciphertext rather than live credentials.
 * This is defence in depth, not a substitute for authorizing the Convex functions themselves.
 *
 * AES-256-GCM. The key is derived from INTEGRATION_TOKEN_SECRET with HKDF-SHA256 and a
 * context-specific info string, so the raw env value is never used as a key directly.
 *
 * Stored format: `maf1.<base64url(iv | authTag | ciphertext)>`
 */

const VERSION_PREFIX = 'maf1.';
const IV_BYTES = 12; // GCM standard nonce length
const TAG_BYTES = 16;
const HKDF_INFO = 'mini-app-factory:integration-token:v1';

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const secret = process.env.INTEGRATION_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'INTEGRATION_TOKEN_SECRET must be set to at least 32 characters to encrypt stored secrets'
    );
  }

  // Empty salt is acceptable here: the input is already a high-entropy application secret, and a
  // fixed derivation keeps decryption deterministic across instances.
  cachedKey = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), HKDF_INFO, 32));
  return cachedKey;
}

/** True if the value is already in our encrypted envelope. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(VERSION_PREFIX);
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext;
  // Never double-wrap — callers may pass a value that came straight back out of the database.
  if (isEncrypted(plaintext)) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return VERSION_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

/**
 * Decrypt a stored secret.
 *
 * Values written before encryption existed are stored as bare plaintext and are returned
 * unchanged, so rows migrate lazily as they are rewritten rather than needing a backfill.
 * Returns null only when the envelope is present but cannot be authenticated — a wrong or
 * rotated INTEGRATION_TOKEN_SECRET, or a tampered row.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!isEncrypted(stored)) return stored; // legacy plaintext

  try {
    const raw = Buffer.from(stored.slice(VERSION_PREFIX.length), 'base64url');
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;

    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Authentication failure. Deliberately opaque — the caller should treat this as "no usable
    // credential" and prompt the user to reconnect, not retry or log the payload.
    return null;
  }
}

/** Encrypt every defined string field of an object, leaving undefined fields absent. */
export function encryptFields<T extends Record<string, string | undefined>>(input: T): T {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = typeof value === 'string' ? encryptSecret(value) : value;
  }
  return out as T;
}
