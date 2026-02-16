import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = 'maf-integration-token-v1'; // static — key derived per secret

let _derivedKey: Buffer | null = null;

function getDerivedKey(): Buffer {
  if (_derivedKey) return _derivedKey;
  const secret = process.env.INTEGRATION_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('INTEGRATION_TOKEN_SECRET must be at least 32 characters');
  }
  _derivedKey = scryptSync(secret, SALT, KEY_LENGTH);
  return _derivedKey;
}

/**
 * Encrypt a plaintext token. Returns a base64-encoded string containing IV + ciphertext + authTag.
 * Returns the original value if INTEGRATION_TOKEN_SECRET is not configured.
 */
export function encryptToken(plaintext: string): string {
  try {
    const key = getDerivedKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: ENC:<base64(iv + encrypted + authTag)>
    const combined = Buffer.concat([iv, encrypted, authTag]);
    return `ENC:${combined.toString('base64')}`;
  } catch {
    // If encryption is not configured, return plaintext (backward-compatible)
    return plaintext;
  }
}

/**
 * Decrypt an encrypted token. If the value doesn't start with `ENC:`, returns it as-is
 * (backward-compatible with existing unencrypted tokens).
 */
export function decryptToken(ciphertext: string): string {
  if (!ciphertext.startsWith('ENC:')) return ciphertext;
  const key = getDerivedKey();
  const combined = Buffer.from(ciphertext.slice(4), 'base64');
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

/**
 * Check if encryption is available (INTEGRATION_TOKEN_SECRET is configured).
 */
export function isEncryptionAvailable(): boolean {
  const secret = process.env.INTEGRATION_TOKEN_SECRET;
  return typeof secret === 'string' && secret.length >= 32;
}
