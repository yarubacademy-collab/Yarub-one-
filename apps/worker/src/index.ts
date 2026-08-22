import { Worker, Queue, type Job as BullJob } from 'bullmq';
import IORedis from 'ioredis';
import { loadConfig } from '@yarub/config';
import { buildRegistry } from '@yarub/providers';
import { prisma } from '@yarub/db';
import { S3Storage } from '@yarub/storage';
import { packageBundle } from '@yarub/sandbox';
import {
  CapabilityRouter,
  Orchestrator,
  assemble,
  planSchema,
  type Plan,
} from '@yarub/ai-core';
import { PrismaCheckpointStore } from './services/checkpoint-store.js';
import { TextExecutor } from './executors/text.executor.js';
import { CodeExecutor } from './executors/code.executor.js';
import { ImageExecutor } from './executors/image.executor.js';
import { VideoExecutor } from './executors/video.executor.js';
import { DocumentExecutor } from './executors/document.executor.js';
import { registerCompactionSchedule } from './schedules/compact.js';

const config = loadConfig();
const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

export const JOB_QUEUE = 'yarub.jobs';
export const jobQueue = new Queue(JOB_QUEUE, { connection });

const registry = buildRegistry(config);
const router = new CapabilityRouter(registry);
const storage = new S3Storage({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  bucket: config.S3_BUCKET,
  accessKeyId: config.S3_ACCESS_KEY_ID,
  secretAccessKey: config.S3_SECRET_ACCESS_KEY,
});

const quotas = {
  jobsPerDay: config.QUOTA_JOBS_PER_DAY,
  imagesPerDay: config.QUOTA_IMAGES_PER_DAY,
  videoSecondsPerDay: config.QUOTA_VIDEO_SECONDS_PER_DAY,
};

interface JobPayload {
  jobId: string;
  projectId: string;
  userId: string;
}

/**
 * One BullMQ job == one YARUB ONE plan execution.
 *
 * Concurrency is deliberately modest: the expensive resource is the provider
 * quota, not this process, and a stampede here becomes a bill there.
 */
const worker = new Worker<JobPayload>(
  JOB_QUEUE,
  async (bull: BullJob<JobPayload>) => {
    const { jobId, projectId, userId } = bull.data;

    const record = await prisma.job.findUnique({ where: { id: jobId } });
    if (!record?.planJson) throw new Error(`Job ${jobId} has no plan`);

    // The plan came from an LLM and has been sitting in the database.
    // Re-validate before executing: never trust stored generated structure.
    const plan: Plan = planSchema.parse(record.planJson);

    await prisma.job.update({ where: { id: jobId }, data: { status: 'running' } });

    // The duration ceiling travels with the job so the executor cannot be
    // asked for a longer render than the owner's plan permits.
    const maxVideoSeconds = (record.planJson as { maxVideoSeconds?: number })?.maxVideoSeconds ?? 10;

    const available = await router.availableCapabilities(
      plan.steps.map((s) => s.capability),
    );

    const orchestrator = new Orchestrator({
      store: new PrismaCheckpointStore(),
      availableCapabilities: available,
      executors: [
        new TextExecutor(router, userId),
        new CodeExecutor(router, userId),
        new ImageExecutor(router, storage, userId, projectId, quotas, config.CREDITS_ENABLED),
        new VideoExecutor(router, storage, userId, projectId, quotas, config.CREDITS_ENABLED, maxVideoSeconds),
        new DocumentExecutor(storage, projectId),
      ],
      onProgress: async (event) => {
        await bull.updateProgress(event.percent);
      },
    });

    const outcome = await orchestrator.run(jobId, plan);

    if (outcome.status === 'cancelled') {
      await prisma.job.update({ where: { id: jobId }, data: { status: 'cancelled' } });
      return { status: outcome.status };
    }

    const artifact = assemble({ plan, outcome });

    // Website and game bundles are validated for sandbox safety before they
    // are stored, so an unsafe bundle can never reach the preview origin.
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
        meta: { gaps: artifact.gaps, files: files.map((f) => f.path) },
      },
    });

    for (const file of files) {
      await storage.put(
        `projects/${projectId}/artifacts/${stored.id}/v1/${file.path}`,
        new TextEncoder().encode(file.content),
        file.mime,
      );
    }

    await prisma.artifact.update({
      where: { id: stored.id },
      data: { currentVersionId: version.id },
    });

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: outcome.status === 'failed' ? 'failed' : 'succeeded',
        progress: 100,
      },
    });

    return { status: outcome.status, artifactId: stored.id, gaps: artifact.gaps };
  },
  { connection, concurrency: 4 },
);

worker.on('failed', async (bull, error) => {
  if (!bull) return;
  await prisma.job.update({
    where: { id: bull.data.jobId },
    data: { status: 'failed', errorCode: error.name },
  });
  console.error(`[job:${bull.data.jobId}] failed`, error.message);
});

worker.on('completed', (bull) => {
  console.log(`[job:${bull.data.jobId}] completed`);
});

const shutdown = async () => {
  await worker.close();
  await connection.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

registerCompactionSchedule(connection, router);

console.log('YARUB ONE worker ready');
