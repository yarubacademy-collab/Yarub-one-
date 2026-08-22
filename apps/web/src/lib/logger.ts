import { randomUUID } from 'node:crypto';
import { AppError } from '@yarub/shared';

/**
 * Structured logging with correlation.
 *
 * The user sees a short id and a safe sentence; the server log holds the
 * stack, the provider response and the request context under that same id.
 * That keeps support answerable without ever putting internals on a screen.
 */

export interface LogContext {
  correlationId: string;
  userId?: string;
  jobId?: string;
  route?: string;
}

export function newCorrelationId(): string {
  return randomUUID().slice(0, 8);
}

function emit(level: 'info' | 'warn' | 'error', message: string, context: Partial<LogContext>, extra?: unknown) {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...context,
    ...(extra !== undefined ? { detail: serialise(extra) } : {}),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function serialise(value: unknown): unknown {
  if (value instanceof AppError) {
    return { code: value.code, message: value.message, cause: String(value.cause ?? '') };
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export const log = {
  info: (message: string, context: Partial<LogContext> = {}, extra?: unknown) =>
    emit('info', message, context, extra),
  warn: (message: string, context: Partial<LogContext> = {}, extra?: unknown) =>
    emit('warn', message, context, extra),
  error: (message: string, context: Partial<LogContext> = {}, extra?: unknown) =>
    emit('error', message, context, extra),
};

/** Maps an error to an HTTP status and a body safe to send to a browser. */
export function toHttpResponse(error: unknown, context: Partial<LogContext> = {}): Response {
  const correlationId = context.correlationId ?? newCorrelationId();

  if (error instanceof AppError) {
    const status = STATUS_BY_CODE[error.code] ?? 500;
    // Client faults are noise at error level; server faults are not.
    log[status >= 500 ? 'error' : 'warn'](error.code, { ...context, correlationId }, error);
    return Response.json({ ...error.toPublic(), correlationId }, { status });
  }

  log.error('UNHANDLED', { ...context, correlationId }, error);
  return Response.json(
    { code: 'INTERNAL', message: 'Something went wrong.', correlationId },
    { status: 500 },
  );
}

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
