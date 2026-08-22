import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Encryption for provider credentials held in the database.
 *
 * Moving provider configuration out of environment variables and into Settings
 * means API keys now sit in Postgres. A database dump must therefore not be
 * enough to use them: AES-256-GCM gives confidentiality plus an authentication
 * tag, so a tampered ciphertext fails loudly instead of decrypting to garbage
 * that gets sent to a provider.
 *
 * The key is derived from a dedicated secret rather than reusing AUTH_SECRET,
 * so rotating sessions and rotating credential encryption stay independent.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 1;

export function deriveKey(secret: string, salt = 'yarub.credentials.v1'): Buffer {
  if (secret.length < 32) {
    throw new Error('Credential secret must be at least 32 characters');
  }
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret), Buffer.from(salt), Buffer.from('provider-credentials'), 32));
}

/**
 * Output layout: version | iv | tag | ciphertext, base64url encoded.
 * The version byte exists so a future algorithm change can decrypt old values.
 */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([Buffer.from([VERSION]), iv, tag, ciphertext]).toString('base64url');
}

export function decryptSecret(encoded: string, key: Buffer): string {
  const raw = Buffer.from(encoded, 'base64url');

  if (raw.length < 1 + IV_BYTES + TAG_BYTES) {
    throw new Error('Malformed encrypted credential');
  }
  if (raw[0] !== VERSION) {
    throw new Error(`Unsupported credential encryption version: ${raw[0]}`);
  }

  const iv = raw.subarray(1, 1 + IV_BYTES);
  const tag = raw.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(1 + IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  // Throws if the tag does not verify — tampering is an error, not a silent pass.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * What Settings is allowed to show. A key must be recognisable to its owner
 * without being reconstructable by anyone reading the screen or a log.
 */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 8) return '••••••••';
  return `${plaintext.slice(0, 3)}••••${plaintext.slice(-4)}`;
}

/** Constant-time comparison, for confirming an unchanged credential. */
export function secretsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
