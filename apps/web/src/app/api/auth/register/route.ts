import { z } from 'zod';
import argon2 from 'argon2';
import { LOCALES } from '@yarub/shared';
import { prisma } from '@yarub/db';
import { createSession } from '../../../../lib/session';
import { enforceRateLimit } from '../../../../lib/rate-limit';
import { errorResponse } from '../../chat/stream/route';

export const runtime = 'nodejs';

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(10).max(200),
  locale: z.enum(LOCALES).default('ar'),
});

export async function POST(request: Request) {
  try {
    await enforceRateLimit('register:global', 20);
    const body = schema.parse(await request.json());

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    // Same response either way: registration must not reveal who has an account.
    if (existing) return Response.json({ ok: true });

    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash: await argon2.hash(body.password, { type: argon2.argon2id }),
        locale: body.locale,
      },
    });

    await prisma.auditLog.create({ data: { userId: user.id, action: 'auth.register' } });
    await createSession(user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
