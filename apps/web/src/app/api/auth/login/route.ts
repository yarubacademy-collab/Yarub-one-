import { z } from 'zod';
import argon2 from 'argon2';
import { AppError } from '@yarub/shared';
import { prisma } from '@yarub/db';
import { createSession } from '../../../../lib/session';
import { enforceRateLimit } from '../../../../lib/rate-limit';
import { errorResponse } from '../../chat/stream/route';

export const runtime = 'nodejs';

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

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
      throw new AppError('UNAUTHORIZED', 'Bad credentials', 'ای میل یا پاس ورڈ درست نہیں۔');
    }

    await createSession(user.id);
    await prisma.auditLog.create({ data: { userId: user.id, action: 'auth.login' } });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
