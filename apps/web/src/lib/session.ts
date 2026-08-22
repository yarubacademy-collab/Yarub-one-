import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { AppError } from '@yarub/shared';
import { loadConfig } from '@yarub/config';

/**
 * Session handling.
 *
 * httpOnly cookie, so the token is unreachable from any script in the page —
 * including anything a prompt-injection attempt manages to render.
 */

const COOKIE = 'yarub_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function secret(): Uint8Array {
  return new TextEncoder().encode(loadConfig().AUTH_SECRET);
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function currentUserId(): Promise<string | undefined> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return undefined;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

export async function requireUserId(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) {
    throw new AppError('UNAUTHORIZED', 'No valid session', 'لاگ اِن ضروری ہے۔');
  }
  return userId;
}
