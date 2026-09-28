import { z } from 'zod';
import { LOCALES, type Locale } from '@yarub/shared';
import { prisma } from '@yarub/db';
import { requireUserId } from '../../../lib/session';
import { errorResponse } from '../chat/stream/route';

export const runtime = 'nodejs';

const createSchema = z.object({
  /** Omitted for an ordinary chat: it then goes into the account's own "Chats" project. */
  projectId: z.string().optional(),
  title: z.string().min(1).max(200),
  locale: z.enum(LOCALES).default('en'),
});

/** The one project every ordinary chat lives in, created on first use. */
async function chatProject(userId: string, locale: Locale): Promise<{ id: string }> {
  const existing = await prisma.project.findFirst({
    where: { userId, domain: 'chat', archived: false },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (existing) return existing;

  return prisma.project.create({
    data: { userId, title: 'Chats', domain: 'chat', language: locale },
    select: { id: true },
  });
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const params = new URL(request.url).searchParams;
    const projectId = params.get('projectId');
    // A chat that was started but never answered has no messages; a history list
    // has no use for it.
    const nonEmpty = params.get('nonEmpty') === '1';

    const conversations = await prisma.conversation.findMany({
      where: {
        project: { userId, ...(projectId ? { id: projectId } : {}) },
        ...(nonEmpty ? { messages: { some: {} } } : {}),
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
    const project = body.projectId
      ? await prisma.project.findFirst({
          where: { id: body.projectId, userId },
          select: { id: true },
        })
      : await chatProject(userId, body.locale);
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
