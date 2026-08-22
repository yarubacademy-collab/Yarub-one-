import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  deriveKey,
  encryptSecret,
  maskSecret,
  secretsEqual,
} from '../packages/config/src/crypto';

const SECRET = 'a'.repeat(48);
const key = deriveKey(SECRET);

describe('credential encryption', () => {
  it('round-trips a credential', () => {
    const plaintext = 'sk-live-9f8a7b6c5d4e3f2a1b0c';
    expect(decryptSecret(encryptSecret(plaintext, key), key)).toBe(plaintext);
  });

  it('produces a different ciphertext each time', () => {
    // A deterministic ciphertext would leak which providers share a key.
    const a = encryptSecret('same-value', key);
    const b = encryptSecret('same-value', key);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, key)).toBe(decryptSecret(b, key));
  });

  it('rejects a tampered ciphertext instead of returning garbage', () => {
    const encoded = encryptSecret('sensitive', key);
    const raw = Buffer.from(encoded, 'base64url');
    raw[raw.length - 1] ^= 0xff;
    expect(() => decryptSecret(raw.toString('base64url'), key)).toThrow();
  });

  it('rejects decryption with the wrong key', () => {
    const encoded = encryptSecret('sensitive', key);
    expect(() => decryptSecret(encoded, deriveKey('b'.repeat(48)))).toThrow();
  });

  it('rejects a truncated payload', () => {
    expect(() => decryptSecret('AQID', key)).toThrow();
  });

  it('refuses a weak secret', () => {
    expect(() => deriveKey('short')).toThrow();
  });

  it('derives distinct keys from distinct secrets', () => {
    expect(deriveKey('a'.repeat(48)).equals(deriveKey('c'.repeat(48)))).toBe(false);
  });

  it('masks a key so it is recognisable but not reconstructable', () => {
    const masked = maskSecret('sk-live-9f8a7b6c5d4e3f2a1b0c');
    expect(masked).toContain('sk-');
    expect(masked).not.toContain('9f8a7b6c');
    expect(maskSecret('short')).toBe('••••••••');
  });

  it('compares secrets safely including on length mismatch', () => {
    expect(secretsEqual('abc', 'abc')).toBe(true);
    expect(secretsEqual('abc', 'abcd')).toBe(false);
  });
});
