import { z } from 'zod';
import { prisma } from '@yarub/db';
import { requireAdmin } from '../../../../lib/admin';
import { errorResponse } from '../../chat/stream/route';

export const runtime = 'nodejs';

const SINGLETON_ID = 'main';

export async function GET() {
  try {
    await requireAdmin();
    const row = await prisma.academyInfo.findUnique({ where: { id: SINGLETON_ID } });
    return Response.json({ content: row?.content ?? '' });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    const { content } = z.object({ content: z.string().max(20000) }).parse(await request.json());
    await prisma.academyInfo.upsert({
      where: { id: SINGLETON_ID },
      update: { content },
      create: { id: SINGLETON_ID, content },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
