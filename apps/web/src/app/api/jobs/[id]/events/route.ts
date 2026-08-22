import { prisma } from '@yarub/db';
import { requireUserId } from '../../../../../lib/session';
import { errorResponse } from '../../../chat/stream/route';

export const runtime = 'nodejs';

/**
 * Live job progress.
 *
 * Server-sent events rather than websockets: the traffic is one-directional
 * and this survives ordinary HTTP infrastructure without extra moving parts.
 * Titles are already localized by the planner, so the client renders them
 * as-is and never sees a capability or provider name.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const owned = await prisma.job.findFirst({
      where: { id, project: { userId } },
      select: { id: true },
    });
    if (!owned) return new Response('Not found', { status: 404 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (data: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

        const tick = async () => {
          if (closed) return;
          const job = await prisma.job.findUnique({
            where: { id },
            include: { steps: true },
          });
          if (!job) return;

          send({
            status: job.status,
            progress: job.progress,
            steps: job.steps.map((s: { stepKey: string; status: string }) => ({ stepKey: s.stepKey, status: s.status })),
          });

          if (['succeeded', 'failed', 'cancelled'].includes(job.status)) {
            closed = true;
            clearInterval(timer);
            controller.close();
          }
        };

        const timer = setInterval(tick, 1500);
        await tick();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
