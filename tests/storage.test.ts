import { describe, expect, it } from 'vitest';
import { assertAllowedUpload, sniffMime } from '../packages/storage/src/mime';

const withHeader = (bytes: number[], offset = 0) => {
  const buffer = new Uint8Array(offset + bytes.length + 16);
  bytes.forEach((b, i) => { buffer[offset + i] = b; });
  return buffer;
};

const PNG = withHeader([0x89, 0x50, 0x4e, 0x47]);
const PDF = withHeader([0x25, 0x50, 0x44, 0x46]);

describe('upload validation', () => {
  it('identifies types by magic bytes', () => {
    expect(sniffMime(PNG)).toBe('image/png');
    expect(sniffMime(PDF)).toBe('application/pdf');
  });

  it('ignores a lying extension or declared mime type', () => {
    // A script renamed to .png still fails, because only bytes are trusted.
    const script = new TextEncoder().encode('#!/bin/sh\nrm -rf /');
    expect(sniffMime(script)).toBeUndefined();
    expect(() => assertAllowedUpload(script, ['image/png'], 1_000_000)).toThrow();
  });

  it('rejects a type that is real but not allowed here', () => {
    expect(() => assertAllowedUpload(PDF, ['image/png'], 1_000_000)).toThrow();
  });

  it('enforces the size ceiling', () => {
    expect(() => assertAllowedUpload(PNG, ['image/png'], 4)).toThrow();
  });

  it('accepts an allowed, correctly-sized file', () => {
    expect(assertAllowedUpload(PNG, ['image/png'], 1_000_000)).toBe('image/png');
  });
});
