import type { Capability, CapabilityStatus, Locale } from '@yarub/shared';

export type QualityTier = 'fast' | 'balanced' | 'quality';

export interface ProviderMeta {
  /** Internal id. Never rendered in the product UI. */
  readonly id: string;
  readonly capabilities: readonly Capability[];
  readonly languages: readonly Locale[];
  readonly tier: QualityTier;
  /** Relative cost hint used by the router, not a billing figure. */
  readonly costWeight: number;
}

export interface Provider extends ProviderMeta {
  /**
   * Reports real readiness. Returns 'not_configured' when credentials are
   * absent. It must never return 'available' for an unusable provider —
   * that is what turns a missing key into a fake feature.
   */
  health(): Promise<CapabilityStatus>;
}
