import { z } from 'zod';
import argon2 from 'argon2';
import { AppError, LOCALES, type Localized } from '@yarub/shared';
import { prisma } from '@yarub/db';
import { createSession } from '../../../../lib/session';
import { enforceRateLimit } from '../../../../lib/rate-limit';
import { errorResponse } from '../../chat/stream/route';

export const runtime = 'nodejs';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Optional and defaulted, not required: older clients that never send it
  // still get a sensible message instead of a validation failure.
  locale: z.enum(LOCALES).default('en'),
});

const CREDENTIALS_ERROR: Localized = {
  en: 'Your email or password is incorrect.',
  ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  ur: 'ای میل یا پاس ورڈ درست نہیں۔',
};

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    await enforceRateLimit(`login:${body.email}`, 8, 300);

    const user = await prisma.user.findUnique({ where: { email: body.email } });

    // Hash a dummy value when the account is absent so response timing does
    // not distinguish "no such user" from "wrong password".
    const valid = user
      ? await argon2.verify(user.passwordHash, body.password)
      : (await argon2.hash(body.password), false);

    if (!user || !valid) {
      throw new AppError('UNAUTHORIZED', 'Bad credentials', CREDENTIALS_ERROR[body.locale]);
    }

    await createSession(user.id);
    await prisma.auditLog.create({ data: { userId: user.id, action: 'auth.login' } });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
