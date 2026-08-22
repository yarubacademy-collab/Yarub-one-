import { z } from 'zod';
import { LOCALES } from '@yarub/shared';
import { prisma } from '@yarub/db';
import { requireUserId } from '../../../lib/session';
import { errorResponse } from '../chat/stream/route';

export const runtime = 'nodejs';

const createSchema = z.object({
  title: z.string().min(1).max(200),
  domain: z.string().min(1).max(40),
  language: z.enum(LOCALES),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const projects = await prisma.project.findMany({
      where: { userId, archived: false },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return Response.json({ projects });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = createSchema.parse(await request.json());
    const project = await prisma.project.create({ data: { userId, ...body } });
    return Response.json({ id: project.id });
  } catch (error) {
    return errorResponse(error);
  }
}
