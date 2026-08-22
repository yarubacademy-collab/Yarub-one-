import { prisma } from '@yarub/db';
import { requireUserId } from '../../../../../lib/session';
import { errorResponse } from '../../../chat/stream/route';

export const runtime = 'nodejs';

/**
 * Cancellation is cooperative: this flips the flag, and the orchestrator
 * honours it at the next step boundary. That avoids abandoning a provider
 * call mid-flight and paying for a result nobody stores.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const job = await prisma.job.findFirst({ where: { id, project: { userId } } });
    if (!job) return Response.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });

    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) {
      return Response.json({ status: job.status });
    }

    await prisma.job.update({ where: { id }, data: { status: 'cancelled' } });
    await prisma.auditLog.create({ data: { userId, action: 'job.cancel', target: id } });
    return Response.json({ status: 'cancelled' });
  } catch (error) {
    return errorResponse(error);
  }
}
