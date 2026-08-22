import type { Capability, Locale } from '@yarub/shared';
import type { ProviderRegistry, QualityTier } from '@yarub/providers';

/**
 * Step 4: capability -> concrete provider.
 *
 * The Core asks for "image.generate in Arabic, quality tier". It never asks
 * for a named model. Swapping vendors is therefore a registry change.
 */

/** Steps that shape the whole artifact deserve the strongest tier. */
const TIER_BY_CAPABILITY: Partial<Record<Capability, QualityTier>> = {
  'text.reason': 'quality',
  'code.generate': 'quality',
  'text.translate': 'balanced',
  'text.generate': 'balanced',
  'speech.stt': 'fast',
};

export class CapabilityRouter {
  constructor(private readonly registry: ProviderRegistry) {}

  route<T>(capability: Capability, language: Locale) {
    return this.registry.resolve<never>({
      capability,
      language,
      ...(TIER_BY_CAPABILITY[capability] ? { preferredTier: TIER_BY_CAPABILITY[capability]! } : {}),
    }) as Promise<import('@yarub/shared').Result<T>>;
  }

  /** Capabilities that currently have a healthy provider. Feeds the Planner. */
  async availableCapabilities(all: readonly Capability[]): Promise<Capability[]> {
    const report = await this.registry.report(all);
    return report.filter((r) => r.status !== 'not_configured').map((r) => r.capability);
  }
}
