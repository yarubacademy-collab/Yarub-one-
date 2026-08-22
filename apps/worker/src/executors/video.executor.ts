import type { StepExecutionContext, StepExecutionResult, StepExecutor } from '@yarub/ai-core';
import type { CapabilityRouter } from '@yarub/ai-core';
import type { VideoProvider } from '@yarub/providers';
import { AppError, type Capability } from '@yarub/shared';
import type { ObjectStorage } from '@yarub/storage';
import { assertSufficientCredits, assertWithinQuota, recordUsage, type Quotas } from '../services/usage.js';

const DEFAULT_DURATION = 5;

/**
 * The duration ceiling is passed in from the server-side entitlement check.
 * The executor never reads a duration from the plan or the request, so a
 * tampered client cannot lengthen a render.
 */

/**
 * Video steps are long-running and expensive, so this executor polls a ticket
 * rather than holding a request open, checks the quota in seconds before
 * spending anything, and aborts cleanly when the job is cancelled.
 */
export class VideoExecutor implements StepExecutor {
  constructor(
    private readonly router: CapabilityRouter,
    private readonly storage: ObjectStorage,
    private readonly userId: string,
    private readonly projectId: string,
    private readonly quotas: Quotas,
    private readonly creditsEnabled = false,
    private readonly maxVideoSeconds = DEFAULT_DURATION,
    private readonly pollIntervalMs = 5_000,
    private readonly maxPolls = 240,
  ) {}

  supports(capability: Capability): boolean {
    return capability === 'video.textToVideo' || capability === 'video.imageToVideo';
  }

  async execute(ctx: StepExecutionContext): Promise<StepExecutionResult> {
    // Both gates run before submit: an overdrawn render is refused up front
    // rather than discovered when the provider bill arrives.
    const duration = Math.min(DEFAULT_DURATION, this.maxVideoSeconds);

    await assertWithinQuota(this.userId, ctx.step.capability, duration, this.quotas);
    await assertSufficientCredits(this.userId, ctx.step.capability, duration, this.creditsEnabled);

    const resolved = await this.router.route<VideoProvider>(ctx.step.capability, ctx.language);
    if (!resolved.ok) throw resolved.error;
    const provider = resolved.value;

    const { ticketId } = await provider.submit({
      prompt: ctx.prompt,
      durationSeconds: duration,
      aspectRatio: '16:9',
    });

    for (let i = 0; i < this.maxPolls; i += 1) {
      if (ctx.signal.aborted) {
        throw new AppError('JOB_CANCELLED', 'Video job cancelled by user');
      }
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      const status = await provider.poll(ticketId);

      if (status.status === 'succeeded') {
        const key = `projects/${this.projectId}/assets/${ctx.jobId}-${ctx.step.id}.mp4`;
        await this.storage.put(key, status.result.bytes, status.result.mime);
        await recordUsage({
          userId: this.userId,
          jobId: ctx.jobId,
          capability: ctx.step.capability,
          providerId: status.result.providerId,
          units: duration,
        });
        return { outputRef: key, providerId: status.result.providerId, units: duration };
      }

      if (status.status === 'failed') {
        throw new AppError('PROVIDER_FAILED', `Video generation failed: ${status.reason}`);
      }
    }

    throw new AppError('PROVIDER_FAILED', 'Video generation timed out');
  }
}
