import type { StepExecutionContext, StepExecutionResult, StepExecutor } from '@yarub/ai-core';
import { asUntrustedData, systemPrompt } from '@yarub/ai-core';
import type { CapabilityRouter } from '@yarub/ai-core';
import type { TextProvider } from '@yarub/providers';
import type { Capability } from '@yarub/shared';
import { recordUsage } from '../services/usage.js';

const HANDLED: Capability[] = ['text.generate', 'text.reason', 'text.translate'];

/**
 * Text steps. Content produced by an earlier step is fenced as data, so a
 * malicious instruction inside generated or uploaded material cannot hijack
 * the next step of the plan.
 */
export class TextExecutor implements StepExecutor {
  constructor(
    private readonly router: CapabilityRouter,
    private readonly userId: string,
  ) {}

  supports(capability: Capability): boolean {
    return HANDLED.includes(capability);
  }

  async execute(ctx: StepExecutionContext): Promise<StepExecutionResult> {
    const resolved = await this.router.route<TextProvider>(ctx.step.capability, ctx.language);
    if (!resolved.ok) throw resolved.error;
    const provider = resolved.value;

    const res = await provider.generate({
      messages: [
        { role: 'system', content: systemPrompt(ctx.language, false) },
        { role: 'user', content: asUntrustedData('step', ctx.prompt) },
      ],
      language: ctx.language,
      temperature: 0.6,
      maxOutputTokens: 6000,
      signal: ctx.signal,
    });

    await recordUsage({
      userId: this.userId,
      jobId: ctx.jobId,
      capability: ctx.step.capability,
      providerId: res.providerId,
      units: res.usage.outputTokens,
    });

    return { outputRef: res.text, providerId: res.providerId, units: res.usage.outputTokens };
  }
}
