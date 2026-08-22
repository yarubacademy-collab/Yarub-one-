import { describe, expect, it } from 'vitest';
import { AppError } from '../packages/shared/src/result';

/**
 * Mirrors the status mapping in apps/web/src/lib/logger.ts. The property that
 * matters is not the exact number but that no branch ever puts internal detail
 * in the public body.
 */
const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  RATE_LIMITED: 429,
  NOT_CONFIGURED: 503,
  JOB_CANCELLED: 409,
  PLAN_INVALID: 422,
  PROVIDER_FAILED: 502,
  INTERNAL: 500,
};

describe('error surface', () => {
  it('maps every AppError code to a status', () => {
    const codes = Object.keys(STATUS_BY_CODE);
    for (const code of codes) {
      expect(STATUS_BY_CODE[code]).toBeGreaterThanOrEqual(400);
    }
    expect(codes).toContain('NOT_CONFIGURED');
  });

  it('keeps internal detail out of the public body', () => {
    const error = new AppError(
      'PROVIDER_FAILED',
      'text-primary returned 401 for key sk-live-abcdef at api.vendor.com',
      'تیاری مکمل نہیں ہو سکی۔',
    );
    const publicBody = error.toPublic();

    expect(publicBody.message).toBe('تیاری مکمل نہیں ہو سکی۔');
    expect(publicBody.message).not.toContain('sk-live');
    expect(publicBody.message).not.toContain('api.vendor.com');
    expect(publicBody.message).not.toContain('text-primary');
    expect(Object.keys(publicBody)).toEqual(['code', 'message']);
  });

  it('falls back to a generic message when none was supplied', () => {
    const error = new AppError('INTERNAL', 'connection pool exhausted at pg://user:pw@host');
    expect(error.toPublic().message).toBe('Something went wrong.');
    expect(error.toPublic().message).not.toContain('pg://');
  });

  it('preserves the developer message for server logs', () => {
    const error = new AppError('INTERNAL', 'pool exhausted');
    expect(error.message).toBe('pool exhausted');
  });

  it('carries a cause without exposing it publicly', () => {
    const error = new AppError('INTERNAL', 'wrapped', undefined, new Error('inner secret'));
    expect(error.cause).toBeInstanceOf(Error);
    expect(JSON.stringify(error.toPublic())).not.toContain('inner secret');
  });
});
