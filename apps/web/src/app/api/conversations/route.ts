import { z } from 'zod';
import { prisma } from '@yarub/db';
import { requireUserId } from '../../../lib/session';
import { errorResponse } from '../chat/stream/route';

export const runtime = 'nodejs';

const createSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1).max(200),
});

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const projectId = new URL(request.url).searchParams.get('projectId');

    const conversations = await prisma.conversation.findMany({
      where: {
        project: { userId, ...(projectId ? { id: projectId } : {}) },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { _count: { select: { messages: true } } },
    });

    return Response.json({
      conversations: conversations.map((c: { id: string; title: string; createdAt: Date; _count: { messages: number } }) => ({
        id: c.id,
        title: c.title,
        messageCount: c._count.messages,
        createdAt: c.createdAt,
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

    // Ownership is expressed in the query, so a forged projectId finds nothing.
    const project = await prisma.project.findFirst({
      where: { id: body.projectId, userId },
      select: { id: true },
    });
    if (!project) {
      return Response.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
    }

    const conversation = await prisma.conversation.create({
      data: { projectId: project.id, title: body.title },
    });

    return Response.json({ id: conversation.id, title: conversation.title });
  } catch (error) {
    return errorResponse(error);
  }
}
