import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { getAdminEmails, isAdminEmail, isAdminUser } from '@/lib/admin-access';

const ORIGINAL = process.env.MAF_ADMIN_EMAILS;

describe('admin-access', () => {
  beforeEach(() => {
    delete process.env.MAF_ADMIN_EMAILS;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.MAF_ADMIN_EMAILS;
    else process.env.MAF_ADMIN_EMAILS = ORIGINAL;
  });

  describe('fails closed', () => {
    test('no admins when MAF_ADMIN_EMAILS is unset', () => {
      expect(getAdminEmails()).toEqual([]);
      expect(isAdminEmail('anyone@example.com')).toBe(false);
      expect(isAdminUser({ primaryEmail: 'anyone@example.com', primaryEmailVerified: true })).toBe(false);
    });

    test('no admins when MAF_ADMIN_EMAILS is empty or whitespace', () => {
      process.env.MAF_ADMIN_EMAILS = '   ';
      expect(getAdminEmails()).toEqual([]);
      expect(isAdminUser({ primaryEmail: 'a@b.com', primaryEmailVerified: true })).toBe(false);
    });
  });

  describe('allowlist parsing', () => {
    test('splits, trims, and lowercases a comma-separated list', () => {
      process.env.MAF_ADMIN_EMAILS = ' First@Example.com , second@example.com ,, ';
      expect(getAdminEmails()).toEqual(['first@example.com', 'second@example.com']);
    });

    test('matching is case-insensitive and whitespace-tolerant', () => {
      process.env.MAF_ADMIN_EMAILS = 'admin@example.com';
      expect(isAdminEmail('  ADMIN@Example.COM  ')).toBe(true);
    });

    test('rejects non-strings and empty values', () => {
      process.env.MAF_ADMIN_EMAILS = 'admin@example.com';
      expect(isAdminEmail(null)).toBe(false);
      expect(isAdminEmail(undefined)).toBe(false);
      expect(isAdminEmail('')).toBe(false);
      expect(isAdminEmail('   ')).toBe(false);
    });
  });

  describe('isAdminUser requires a verified email', () => {
    beforeEach(() => {
      process.env.MAF_ADMIN_EMAILS = 'admin@example.com';
    });

    test('grants an allowlisted, verified user', () => {
      expect(isAdminUser({ primaryEmail: 'admin@example.com', primaryEmailVerified: true })).toBe(true);
    });

    test('denies an allowlisted user whose email is unverified', () => {
      expect(isAdminUser({ primaryEmail: 'admin@example.com', primaryEmailVerified: false })).toBe(false);
    });

    test('denies when verification status is missing entirely', () => {
      expect(isAdminUser({ primaryEmail: 'admin@example.com' })).toBe(false);
    });

    test('denies a verified user who is not on the allowlist', () => {
      expect(isAdminUser({ primaryEmail: 'someone@example.com', primaryEmailVerified: true })).toBe(false);
    });

    test('denies null and undefined users', () => {
      expect(isAdminUser(null)).toBe(false);
      expect(isAdminUser(undefined)).toBe(false);
    });
  });
});
