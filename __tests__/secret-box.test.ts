import { describe, test, expect } from 'vitest';
import { encryptSecret, decryptSecret, isEncrypted, encryptFields } from '@/lib/secret-box';

// INTEGRATION_TOKEN_SECRET is set by vitest.setup.ts.

describe('secret-box', () => {
  describe('round trip', () => {
    test('decrypts what it encrypts', () => {
      const plain = 'gho_abcdefghijklmnopqrstuvwxyz0123456789';
      expect(decryptSecret(encryptSecret(plain))).toBe(plain);
    });

    test('handles unicode and long values', () => {
      const plain = JSON.stringify({ opencode: 'キー🔑', openrouter: 'x'.repeat(4000) });
      expect(decryptSecret(encryptSecret(plain))).toBe(plain);
    });

    test('produces a different ciphertext each time (random IV)', () => {
      const a = encryptSecret('same-value');
      const b = encryptSecret('same-value');
      expect(a).not.toBe(b);
      expect(decryptSecret(a)).toBe('same-value');
      expect(decryptSecret(b)).toBe('same-value');
    });

    test('ciphertext does not contain the plaintext', () => {
      const plain = 'super-secret-token';
      expect(encryptSecret(plain)).not.toContain(plain);
    });
  });

  describe('envelope', () => {
    test('tags encrypted values and recognises them', () => {
      const encrypted = encryptSecret('abc');
      expect(encrypted.startsWith('maf1.')).toBe(true);
      expect(isEncrypted(encrypted)).toBe(true);
      expect(isEncrypted('abc')).toBe(false);
      expect(isEncrypted(null)).toBe(false);
    });

    test('does not double-encrypt an already-encrypted value', () => {
      const once = encryptSecret('abc');
      expect(encryptSecret(once)).toBe(once);
    });

    test('passes empty strings through untouched', () => {
      expect(encryptSecret('')).toBe('');
    });
  });

  describe('legacy plaintext', () => {
    test('returns unprefixed values unchanged so old rows keep working', () => {
      expect(decryptSecret('gho_legacy_plaintext_token')).toBe('gho_legacy_plaintext_token');
    });

    test('returns null for empty input', () => {
      expect(decryptSecret(null)).toBeNull();
      expect(decryptSecret(undefined)).toBeNull();
      expect(decryptSecret('')).toBeNull();
    });
  });

  describe('tamper resistance', () => {
    test('returns null when the ciphertext is modified', () => {
      const encrypted = encryptSecret('sensitive');
      // Flip a character in the payload, keeping the envelope prefix intact.
      const body = encrypted.slice('maf1.'.length);
      const flipped = body.slice(0, 10) + (body[10] === 'A' ? 'B' : 'A') + body.slice(11);
      expect(decryptSecret('maf1.' + flipped)).toBeNull();
    });

    test('returns null for a truncated envelope', () => {
      expect(decryptSecret('maf1.short')).toBeNull();
    });

    test('returns null for garbage inside the envelope', () => {
      expect(decryptSecret('maf1.' + 'z'.repeat(80))).toBeNull();
    });
  });

  describe('encryptFields', () => {
    test('encrypts defined strings and preserves undefined', () => {
      const out = encryptFields({
        githubAccessToken: 'gho_x',
        vercelAccessToken: undefined,
      });

      expect(isEncrypted(out.githubAccessToken)).toBe(true);
      expect(decryptSecret(out.githubAccessToken)).toBe('gho_x');
      expect(out.vercelAccessToken).toBeUndefined();
    });
  });
});
