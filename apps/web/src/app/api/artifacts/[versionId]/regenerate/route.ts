import { z } from 'zod';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@yarub/db';
import { loadConfig } from '@yarub/config';
import { core } from '../../../../../lib/core';
import { requireUserId } from '../../../../../lib/session';
import { QuotaExceededError, enforcePlan, resolveEntitlements } from '../../../../../lib/entitlements';
import { errorResponse } from '../../../chat/stream/route';

export const runtime = 'nodejs';

const connection = new IORedis(loadConfig().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
const jobQueue = new Queue('yarub.jobs', { connection });

const schema = z.object({
  instruction: z.string().min(1).max(8000),
  locale: z.enum(['ar', 'ur', 'en']),
});

/**
 * Edit and regenerate.
 *
 * Completes the artifact lifecycle: generate → preview → edit → regenerate →
 * version → export. Regeneration is a new job against the same project, so the
 * previous version is kept rather than overwritten — an edit that turns out
 * worse is always recoverable.
 *
 * It is quota-checked like any other creation, because "regenerate" would
 * otherwise be an unmetered way to keep spending on providers.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { versionId } = await params;
    const body = schema.parse(await request.json());

    const version = await prisma.artifactVersion.findFirst({
      where: { id: versionId, artifact: { project: { userId } } },
      include: { artifact: { include: { project: true } } },
    });
    if (!version) {
      return Response.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
    }

    const project = version.artifact.project;

    // The existing artifact is context for the edit, so the model revises
    // rather than starting over.
    const decision = await core().decide({
      rawRequest: `Revise the existing ${version.artifact.type} titled "${version.artifact.title}". Requested change: ${body.instruction}`,
      locale: body.locale,
      project: {
        title: project.title,
        domain: project.domain,
        artifacts: [version.artifact.title],
      },
    });

    if (decision.kind !== 'project') {
      return Response.json({ code: 'PLAN_INVALID', message: 'Could not plan a revision' }, { status: 422 });
    }

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

    const job = await prisma.job.create({
      data: {
        projectId: project.id,
        type: decision.plan.outputArtifactType,
        status: 'queued',
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

    await prisma.auditLog.create({
      data: { userId, action: 'artifact.regenerate', target: versionId },
    });

    return Response.json({
      jobId: job.id,
      projectId: project.id,
      plan: {
        title: decision.plan.title[body.locale],
        steps: decision.plan.steps.map((s: (typeof decision.plan.steps)[number]) => ({
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
