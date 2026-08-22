export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E = AppError> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'NOT_CONFIGURED'
  | 'PROVIDER_FAILED'
  | 'PLAN_INVALID'
  | 'JOB_CANCELLED'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    /** Safe to show the user, already localized. Never contains provider details. */
    readonly userMessage?: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  /** What crosses the network boundary. Stack traces stay in server logs. */
  toPublic(): { code: AppErrorCode; message: string } {
    return { code: this.code, message: this.userMessage ?? 'Something went wrong.' };
  }
}
