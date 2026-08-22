import { destroySession } from '../../../../lib/session';

export const runtime = 'nodejs';

export async function POST() {
  await destroySession();
  return Response.json({ ok: true });
}
