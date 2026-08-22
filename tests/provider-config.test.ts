import { describe, expect, it } from 'vitest';
import { deriveKey, encryptSecret, maskSecret } from '../packages/config/src/crypto';

/**
 * These assert the security properties the provider-config module depends on,
 * without needing a database. The module itself is exercised by integration
 * tests that require Postgres.
 */
describe('stored credential handling', () => {
  const key = deriveKey('k'.repeat(48));

  it('never stores a credential in readable form', () => {
    const plaintext = 'sk-live-abcdef0123456789';
    const stored = encryptSecret(plaintext, key);
    expect(stored).not.toContain(plaintext);
    expect(stored).not.toContain('abcdef');
    expect(Buffer.from(stored, 'base64url').toString('utf8')).not.toContain('sk-live');
  });

  it('produces a hint that identifies without revealing', () => {
    const plaintext = 'sk-live-abcdef0123456789';
    const hint = maskSecret(plaintext);
    expect(hint.length).toBeLessThan(plaintext.length);
    expect(plaintext).toContain(hint.slice(0, 3));
    expect(hint).not.toContain('abcdef0123');
  });

  it('keeps hints stable for the same key so operators can recognise them', () => {
    expect(maskSecret('sk-live-abcdef0123456789')).toBe(maskSecret('sk-live-abcdef0123456789'));
  });

  it('gives different hints to different keys', () => {
    expect(maskSecret('sk-live-aaaaaaaaaaaa1111')).not.toBe(maskSecret('sk-live-bbbbbbbbbbbb2222'));
  });
});
