import { z } from 'zod';
import { prisma } from '@yarub/db';
import { requireUserId } from '../../../../lib/session';
import { errorResponse } from '../../chat/stream/route';

export const runtime = 'nodejs';

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  archived: z.boolean().optional(),
  /** Copies structure and artifacts metadata into a new project. */
  duplicate: z.literal(true).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) {
      return Response.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
    }

    if (body.duplicate) {
      // Artifacts are duplicated by reference to the same storage keys: the
      // bytes are immutable and shared, while versions diverge from here on.
      const source = await prisma.project.findUniqueOrThrow({
        where: { id },
        include: { artifacts: { include: { versions: true } } },
      });

      const copy = await prisma.project.create({
        data: {
          userId,
          title: `${source.title} (2)`,
          domain: source.domain,
          language: source.language,
        },
      });

      for (const artifact of source.artifacts) {
        const created = await prisma.artifact.create({
          data: { projectId: copy.id, type: artifact.type, title: artifact.title },
        });
        for (const version of artifact.versions) {
          await prisma.artifactVersion.create({
            data: {
              artifactId: created.id,
              version: version.version,
              storageKey: version.storageKey,
              meta: version.meta ?? undefined,
            },
          });
        }
      }

      await prisma.auditLog.create({ data: { userId, action: 'project.duplicate', target: id } });
      return Response.json({ id: copy.id });
    }

    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...(body.title ? { title: body.title } : {}),
        ...(body.archived !== undefined ? { archived: body.archived } : {}),
      },
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

    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) {
      return Response.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
    }

    // Cascades to conversations, jobs, artifacts and assets by schema.
    await prisma.project.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId, action: 'project.delete', target: id } });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
