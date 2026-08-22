import { Queue, Worker } from 'bullmq';
import type IORedis from 'ioredis';
import { prisma } from '@yarub/db';
import type { CapabilityRouter } from '@yarub/ai-core';
import { compactConversation } from '../services/summarizer.js';

export const COMPACT_QUEUE = 'yarub.compact';

/**
 * Runs hourly. Conversations grow while people work; compaction happens on a
 * schedule rather than in the request path so no user ever waits for it.
 */
export function registerCompactionSchedule(connection: IORedis, router: CapabilityRouter) {
  const queue = new Queue(COMPACT_QUEUE, { connection });

  void queue.upsertJobScheduler(
    'hourly-compaction',
    { pattern: '0 * * * *' },
    { name: 'compact' },
  );

  const worker = new Worker(
    COMPACT_QUEUE,
    async () => {
      const candidates = await prisma.conversation.findMany({
        where: { messages: { some: {} } },
        include: { _count: { select: { messages: true } } },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });

      let total = 0;
      for (const conversation of candidates) {
        if (conversation._count.messages <= 20) continue;
        const result = await compactConversation(conversation.id, router);
        total += result?.compacted ?? 0;
      }
      return { compacted: total };
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (_job, error) => {
    console.error('[compaction] failed', error.message);
  });

  return { queue, worker };
}
