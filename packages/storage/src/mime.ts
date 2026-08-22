import { AppError } from '@yarub/shared';

/**
 * Upload validation, deliberately dependency-free.
 *
 * Extensions and client-declared Content-Type headers are attacker-controlled,
 * so neither is trusted: type is decided by the file's own leading bytes.
 */

const SIGNATURES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'video/mp4', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  { mime: 'audio/mpeg', bytes: [0x49, 0x44, 0x33] },
];

export const ALLOWED_UPLOAD_MIMES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'audio/mpeg',
] as const;

export function sniffMime(bytes: Uint8Array): string | undefined {
  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (sig.bytes.every((b, i) => bytes[offset + i] === b)) return sig.mime;
  }
  return undefined;
}

export function assertAllowedUpload(
  bytes: Uint8Array,
  allowed: readonly string[],
  maxBytes: number,
): string {
  if (bytes.byteLength > maxBytes) {
    throw new AppError('VALIDATION_FAILED', 'File too large', 'فائل بہت بڑی ہے۔');
  }
  const mime = sniffMime(bytes);
  if (!mime || !allowed.includes(mime)) {
    throw new AppError(
      'VALIDATION_FAILED',
      `Rejected upload type: ${mime ?? 'unrecognised'}`,
      'اس قسم کی فائل قبول نہیں کی جاتی۔',
    );
  }
  return mime;
}
