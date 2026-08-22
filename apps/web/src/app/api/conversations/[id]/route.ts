import { z } from 'zod';
import { prisma } from '@yarub/db';
import { requireUserId } from '../../../../lib/session';
import { errorResponse } from '../../chat/stream/route';

export const runtime = 'nodejs';

/**
 * Full message history for one conversation.
 *
 * System messages are excluded: they carry the product's own instructions and
 * are not part of what the user said or was told.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, project: { userId } },
      include: {
        messages: {
          where: { role: { in: ['user', 'assistant'] } },
          orderBy: { createdAt: 'asc' },
          take: 500,
        },
        project: { select: { id: true, title: true, language: true } },
      },
    });

    if (!conversation) {
      return Response.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
    }

    return Response.json({
      id: conversation.id,
      title: conversation.title,
      project: conversation.project,
      messages: conversation.messages.map((m: { id: string; role: string; content: string; createdAt: Date }) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

const renameSchema = z.object({ title: z.string().min(1).max(200) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = renameSchema.parse(await request.json());

    const owned = await prisma.conversation.findFirst({
      where: { id, project: { userId } },
      select: { id: true },
    });
    if (!owned) {
      return Response.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: { title: body.title },
    });
    return Response.json({ id: updated.id, title: updated.title });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const owned = await prisma.conversation.findFirst({
      where: { id, project: { userId } },
      select: { id: true },
    });
    if (!owned) {
      return Response.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
    }

    await prisma.conversation.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId, action: 'conversation.delete', target: id } });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
