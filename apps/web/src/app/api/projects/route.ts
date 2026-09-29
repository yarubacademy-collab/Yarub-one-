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

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const domain = new URL(request.url).searchParams.get('domain');

    const projects = await prisma.project.findMany({
      where: { userId, archived: false, ...(domain ? { domain } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      // Enough to show a result or a still-running state, without sending the
      // job's full step history or a file's contents down to the list screen.
      include: {
        jobs: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
        artifacts: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { currentVersionId: true },
        },
      },
    });

    return Response.json({
      projects: projects.map((p) => ({
        id: p.id,
        title: p.title,
        createdAt: p.createdAt,
        status: p.jobs[0]?.status ?? null,
        versionId: p.artifacts[0]?.currentVersionId ?? null,
      })),
    });
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
