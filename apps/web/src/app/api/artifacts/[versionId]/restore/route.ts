import { prisma } from '@yarub/db';
import { requireUserId } from '../../../../../lib/session';
import { errorResponse } from '../../../chat/stream/route';

export const runtime = 'nodejs';

/**
 * Version rollback.
 *
 * Restoring copies the old version forward as a new one rather than moving the
 * pointer backwards. History stays append-only, so a rollback is itself
 * undoable and the audit trail never loses an intermediate state.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { versionId } = await params;

    const version = await prisma.artifactVersion.findFirst({
      where: { id: versionId, artifact: { project: { userId } } },
      include: { artifact: { include: { versions: { orderBy: { version: 'desc' }, take: 1 } } } },
    });

    if (!version) {
      return Response.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
    }

    const latest = version.artifact.versions[0]?.version ?? version.version;

    const restored = await prisma.artifactVersion.create({
      data: {
        artifactId: version.artifactId,
        version: latest + 1,
        storageKey: version.storageKey,
        meta: version.meta ?? undefined,
      },
    });

    await prisma.artifact.update({
      where: { id: version.artifactId },
      data: { currentVersionId: restored.id },
    });

    await prisma.auditLog.create({
      data: { userId, action: 'artifact.restore', target: versionId },
    });

    return Response.json({ versionId: restored.id, version: restored.version });
  } catch (error) {
    return errorResponse(error);
  }
}
