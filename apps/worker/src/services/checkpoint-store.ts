import { prisma } from '@yarub/db';
import type { CheckpointStore, StepRecord } from '@yarub/ai-core';

/**
 * Postgres-backed checkpointing.
 *
 * This is what makes a seven-step book generation survive a crash at step six:
 * completed steps are rows, not memory, so a resumed job re-runs only what
 * actually failed and never re-spends on providers that already succeeded.
 */
export class PrismaCheckpointStore implements CheckpointStore {
  async load(jobId: string): Promise<StepRecord[]> {
    const rows = await prisma.jobStep.findMany({ where: { jobId } });
    return rows.map((r) => ({
      stepKey: r.stepKey,
      status: r.status as StepRecord['status'],
      attempts: r.attempts,
      ...(r.providerId ? { providerId: r.providerId } : {}),
      ...(r.outputRef ? { outputRef: r.outputRef } : {}),
      ...(r.errorCode ? { errorCode: r.errorCode } : {}),
    }));
  }

  async save(jobId: string, record: StepRecord): Promise<void> {
    const data = {
      status: record.status,
      attempts: record.attempts,
      providerId: record.providerId ?? null,
      outputRef: record.outputRef ?? null,
      errorCode: record.errorCode ?? null,
      ...(record.status === 'running' ? { startedAt: new Date() } : {}),
      ...(record.status === 'succeeded' || record.status === 'failed'
        ? { finishedAt: new Date() }
        : {}),
    };

    await prisma.jobStep.upsert({
      where: { jobId_stepKey: { jobId, stepKey: record.stepKey } },
      update: data,
      create: { jobId, stepKey: record.stepKey, capability: 'unknown', ...data },
    });
  }

  async isCancelled(jobId: string): Promise<boolean> {
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } });
    return job?.status === 'cancelled';
  }

  async setProgress(jobId: string, percent: number): Promise<void> {
    await prisma.job.update({ where: { id: jobId }, data: { progress: percent } });
  }
}
