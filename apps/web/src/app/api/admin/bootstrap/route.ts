import { prisma } from '@yarub/db';
import { currentUserId } from '../../../../lib/session';

export const runtime = 'nodejs';

/**
 * One-time admin bootstrap.
 *
 * There is no in-app "make me the first admin" button by design — normally
 * that's the operator's own database access, done once outside the app.
 * This route stands in for that single step so it can be done from a link
 * instead of a SQL console: it only ever promotes the account making the
 * request, and only when the caller already knows a secret that lives
 * solely in this deployment's own environment variables.
 */
export async function GET(request: Request) {
  const secret = new URL(request.url).searchParams.get('secret');
  const expected = process.env.ADMIN_BOOTSTRAP_SECRET;

  if (!expected) {
    return Response.json({ error: 'ADMIN_BOOTSTRAP_SECRET is not set' }, { status: 500 });
  }
  if (!secret || secret !== expected) {
    return Response.json({ error: 'Wrong or missing secret' }, { status: 403 });
  }

  const userId = await currentUserId();
  if (!userId) {
    return Response.json({ error: 'Sign in first, then open this link again' }, { status: 401 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role: 'ADMIN' },
    select: { email: true, role: true },
  });

  return Response.json({ ok: true, promoted: user.email, role: user.role });
}
