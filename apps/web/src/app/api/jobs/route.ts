import { z } from 'zod';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { LOCALES, AppError } from '@yarub/shared';
import { prisma } from '@yarub/db';
import { loadConfig } from '@yarub/config';
import { core } from '../../../lib/core';
import { requireUserId } from '../../../lib/session';
import { enforceRateLimit } from '../../../lib/rate-limit';
import { errorResponse } from '../chat/stream/route';
import { QuotaExceededError, enforcePlan, resolveEntitlements } from '../../../lib/entitlements';

export const runtime = 'nodejs';

const connection = new IORedis(loadConfig().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
const jobQueue = new Queue('yarub.jobs', { connection });

const bodySchema = z.object({
  request: z.string().min(1).max(24_000),
  locale: z.enum(LOCALES),
  projectId: z.string().optional(),
});

/**
 * Creates a project and queues its plan.
 *
 * The plan is produced and validated here, then handed to the worker. Nothing
 * long-running happens inside this request.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit(`jobs:${userId}`, 10);

    const body = bodySchema.parse(await request.json());
    const decision = await core().decide({ rawRequest: body.request, locale: body.locale });

    if (decision.kind !== 'project') {
      return Response.json({ kind: decision.kind }, { status: 200 });
    }

    // Pre-flight entitlement check. A plan that would exceed the user's
    // allowance is refused before any provider is called, so the user is told
    // up front rather than after paid steps have already run.
    try {
      await enforcePlan({
        userId,
        artifactType: decision.plan.outputArtifactType,
        capabilities: decision.plan.steps.map((s: (typeof decision.plan.steps)[number]) => s.capability),
      });
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        return Response.json(
          {
            code: 'QUOTA_EXCEEDED',
            action: error.decision.action,
            used: error.decision.used,
            limit: error.decision.limit,
            planCode: error.planCode,
            upgradeUrl: `/${body.locale}/pricing`,
          },
          { status: 402 },
        );
      }
      throw error;
    }

    const entitlements = await resolveEntitlements(userId);

    const project = body.projectId
      ? await prisma.project.findFirstOrThrow({ where: { id: body.projectId, userId } })
      : await prisma.project.create({
          data: {
            userId,
            title: decision.plan.title[body.locale],
            domain: decision.plan.domain,
            language: body.locale,
          },
        });

    const job = await prisma.job.create({
      data: {
        projectId: project.id,
        type: decision.plan.outputArtifactType,
        status: 'queued',
        // The server's own ceiling is stamped onto the stored plan. The worker
        // reads it from here, never from anything the client sent.
        planJson: { ...decision.plan, maxVideoSeconds: entitlements.limits.maxVideoSeconds },
      },
    });

    await prisma.jobStep.createMany({
      data: decision.plan.steps.map((s: (typeof decision.plan.steps)[number]) => ({
        jobId: job.id,
        stepKey: s.id,
        capability: s.capability,
        status: 'pending' as const,
      })),
    });

    await jobQueue.add('execute', { jobId: job.id, projectId: project.id, userId });

    return Response.json({
      kind: 'project',
      projectId: project.id,
      jobId: job.id,
      plan: {
        title: decision.plan.title[body.locale],
        steps: decision.plan.steps.map((s) => ({
          id: s.id,
          title: s.title[body.locale],
          capability: s.capability,
        })),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const jobs = await prisma.job.findMany({
      where: { project: { userId } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { steps: true },
    });
    return Response.json({ jobs });
  } catch (error) {
    return errorResponse(error);
  }
}
