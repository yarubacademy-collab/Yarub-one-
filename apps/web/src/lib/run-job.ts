import { prisma } from '@yarub/db';
import { loadConfig } from '@yarub/config';
import { buildRegistry } from '@yarub/providers';
import { packageBundle } from '@yarub/sandbox';
import { CapabilityRouter, Orchestrator, assemble, planSchema, type Plan } from '@yarub/ai-core';
import { PrismaCheckpointStore } from '../../../worker/src/services/checkpoint-store';
import { TextExecutor } from '../../../worker/src/executors/text.executor';
import { CodeExecutor } from '../../../worker/src/executors/code.executor';

/**
 * Runs a job inside the web app, with no separate worker process.
 *
 * This is the same sequence the worker performs — validate the stored plan, run
 * its steps, assemble the result — for the jobs that are quick and need nothing
 * beyond the text model: websites and games. It is switched on with
 * INLINE_JOBS=1 and does nothing otherwise, so the queue and the worker remain
 * the path for everything else.
 *
 * What it deliberately does not do: images and video (they need their own paid
 * services and take too long for a web request) and documents (rendering needs a
 * full browser, which a web function cannot run). Steps that need those are
 * reported as gaps, exactly as they would be with no provider configured.
 *
 * Generated files are kept inside the artifact version's own record rather than
 * in object storage, so this path needs no storage account at all. The export
 * reads them from there.
 */

/** Stay under the platform's request ceiling, so a job never hangs in "running". */
const DEADLINE_MS = 270_000;

const router = new CapabilityRouter(buildRegistry(loadConfig()));

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('JOB_TIMEOUT')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function runJobInline(input: {
  jobId: string;
  projectId: string;
  userId: string;
}): Promise<void> {
  const { jobId, projectId, userId } = input;

  try {
    const record = await prisma.job.findUnique({ where: { id: jobId } });
    if (!record?.planJson) throw new Error(`Job ${jobId} has no plan`);

    // The plan came from a language model and has been sitting in the database:
    // validate it again before running anything from it.
    const plan: Plan = planSchema.parse(record.planJson);

    await prisma.job.update({ where: { id: jobId }, data: { status: 'running' } });

    const available = await router.availableCapabilities(plan.steps.map((s) => s.capability));

    const orchestrator = new Orchestrator({
      store: new PrismaCheckpointStore(),
      availableCapabilities: available,
      executors: [new TextExecutor(router, userId), new CodeExecutor(router, userId)],
      onProgress: async (event) => {
        await prisma.job.update({
          where: { id: jobId },
          data: { progress: Math.min(99, Math.round(event.percent)) },
        });
      },
    });

    const outcome = await withDeadline(orchestrator.run(jobId, plan), DEADLINE_MS);

    if (outcome.status === 'cancelled') {
      await prisma.job.update({ where: { id: jobId }, data: { status: 'cancelled' } });
      return;
    }

    const artifact = assemble({ plan, outcome });

    // Bundles are checked for sandbox safety before they are stored, so an unsafe
    // one can never reach a preview.
    const files =
      artifact.type === 'website' || artifact.type === 'game'
        ? packageBundle(artifact.files).files
        : artifact.files;

    const stored = await prisma.artifact.create({
      data: { projectId, type: artifact.type, title: artifact.title },
    });

    const version = await prisma.artifactVersion.create({
      data: {
        artifactId: stored.id,
        version: 1,
        storageKey: `projects/${projectId}/artifacts/${stored.id}/v1`,
        meta: {
          gaps: artifact.gaps,
          files: files.map((f) => f.path),
          contents: Object.fromEntries(files.map((f) => [f.path, f.content])),
        },
      },
    });

    await prisma.artifact.update({
      where: { id: stored.id },
      data: { currentVersionId: version.id },
    });

    await prisma.job.update({
      where: { id: jobId },
      data: { status: outcome.status === 'failed' ? 'failed' : 'succeeded', progress: 100 },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.message === 'JOB_TIMEOUT';
    const errorCode = timedOut ? 'TIMEOUT' : error instanceof Error ? error.name : 'UNKNOWN';
    console.error(`[job:${jobId}] failed`, error instanceof Error ? error.message : error);

    // Whatever went wrong, the job must not stay "running" for ever.
    await prisma.job
      .update({ where: { id: jobId }, data: { status: 'failed', errorCode } })
      .catch(() => undefined);
  }
}
