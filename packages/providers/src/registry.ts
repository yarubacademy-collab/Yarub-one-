import {
  AppError,
  type Capability,
  type CapabilityStatus,
  type Locale,
  err,
  ok,
  type Result,
} from '@yarub/shared';
import type { Provider, QualityTier } from './contracts/index.js';

export interface RoutingRequest {
  capability: Capability;
  language: Locale;
  preferredTier?: QualityTier;
}

export interface CapabilityReport {
  capability: Capability;
  status: CapabilityStatus;
  providerCount: number;
}

/**
 * Holds every registered provider and resolves a capability to a concrete one.
 *
 * The registry is the single enforcement point for two rules:
 *  1. The AI Core selects by capability, never by vendor.
 *  2. An unconfigured capability surfaces as NOT_CONFIGURED, never as a
 *     silently-substituted or simulated result.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, Provider>();
  private readonly healthCache = new Map<string, { status: CapabilityStatus; checkedAt: number }>();

  constructor(private readonly healthTtlMs = 60_000) {}

  register(provider: Provider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Duplicate provider id: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
  }

  async statusOf(provider: Provider): Promise<CapabilityStatus> {
    const cached = this.healthCache.get(provider.id);
    if (cached && Date.now() - cached.checkedAt < this.healthTtlMs) return cached.status;

    let status: CapabilityStatus;
    try {
      status = await provider.health();
    } catch {
      status = 'not_configured';
    }
    this.healthCache.set(provider.id, { status, checkedAt: Date.now() });
    return status;
  }

  /**
   * Resolution policy, in order:
   *   availability -> language support -> requested tier -> lower cost weight
   */
  async resolve<T extends Provider>(req: RoutingRequest): Promise<Result<T>> {
    const candidates: Array<{ provider: Provider; status: CapabilityStatus }> = [];

    for (const provider of this.providers.values()) {
      if (!provider.capabilities.includes(req.capability)) continue;
      if (!provider.languages.includes(req.language)) continue;
      const status = await this.statusOf(provider);
      if (status === 'not_configured') continue;
      candidates.push({ provider, status });
    }

    if (candidates.length === 0) {
      return err(
        new AppError(
          'NOT_CONFIGURED',
          `No provider available for capability "${req.capability}" in language "${req.language}"`,
          'یہ صلاحیت ابھی configure نہیں ہوئی۔',
        ),
      );
    }

    candidates.sort((a, b) => {
      const healthy = (c: (typeof candidates)[number]) => (c.status === 'available' ? 0 : 1);
      if (healthy(a) !== healthy(b)) return healthy(a) - healthy(b);

      if (req.preferredTier) {
        const tierMatch = (c: (typeof candidates)[number]) =>
          c.provider.tier === req.preferredTier ? 0 : 1;
        if (tierMatch(a) !== tierMatch(b)) return tierMatch(a) - tierMatch(b);
      }

      return a.provider.costWeight - b.provider.costWeight;
    });

    return ok(candidates[0]!.provider as T);
  }

  /** Powers the Settings capability matrix and disables incomplete UI sections. */
  async report(capabilities: readonly Capability[]): Promise<CapabilityReport[]> {
    const out: CapabilityReport[] = [];
    for (const capability of capabilities) {
      const matching = [...this.providers.values()].filter((p) =>
        p.capabilities.includes(capability),
      );
      const statuses = await Promise.all(matching.map((p) => this.statusOf(p)));
      const usable = statuses.filter((s) => s !== 'not_configured');
      out.push({
        capability,
        status: usable.includes('available')
          ? 'available'
          : usable.length > 0
            ? 'degraded'
            : 'not_configured',
        providerCount: usable.length,
      });
    }
    return out;
  }
}
