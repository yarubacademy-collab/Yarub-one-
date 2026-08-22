import { describe, expect, it } from 'vitest';
import { ProviderRegistry } from '../packages/providers/src/registry';
import type { Provider } from '../packages/providers/src/contracts/base';
import type { CapabilityStatus } from '../packages/shared/src/capability';

function fake(id: string, status: CapabilityStatus, costWeight: number): Provider {
  return {
    id,
    capabilities: ['text.generate'],
    languages: ['ar', 'ur', 'en'],
    tier: 'balanced',
    costWeight,
    health: async () => status,
  };
}

describe('provider registry', () => {
  it('refuses to resolve a capability with no configured provider', async () => {
    const registry = new ProviderRegistry();
    registry.register(fake('a', 'not_configured', 1));
    const result = await registry.resolve({ capability: 'text.generate', language: 'ar' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_CONFIGURED');
  });

  it('never silently substitutes another capability', async () => {
    const registry = new ProviderRegistry();
    registry.register(fake('a', 'available', 1));
    const result = await registry.resolve({ capability: 'image.generate', language: 'ar' });
    expect(result.ok).toBe(false);
  });

  it('prefers the cheaper of two healthy providers', async () => {
    const registry = new ProviderRegistry();
    registry.register(fake('expensive', 'available', 50));
    registry.register(fake('cheap', 'available', 2));
    const result = await registry.resolve({ capability: 'text.generate', language: 'en' });
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.value as Provider).id).toBe('cheap');
  });

  it('prefers a healthy provider over a degraded cheaper one', async () => {
    const registry = new ProviderRegistry();
    registry.register(fake('degraded-cheap', 'degraded', 1));
    registry.register(fake('healthy', 'available', 99));
    const result = await registry.resolve({ capability: 'text.generate', language: 'en' });
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.value as Provider).id).toBe('healthy');
  });

  it('excludes providers that do not support the language', async () => {
    const registry = new ProviderRegistry();
    registry.register({ ...fake('en-only', 'available', 1), languages: ['en'] });
    const result = await registry.resolve({ capability: 'text.generate', language: 'ur' });
    expect(result.ok).toBe(false);
  });

  it('reports capability status for the settings matrix', async () => {
    const registry = new ProviderRegistry();
    registry.register(fake('a', 'available', 1));
    const report = await registry.report(['text.generate', 'video.textToVideo']);
    expect(report.find((r) => r.capability === 'text.generate')?.status).toBe('available');
    expect(report.find((r) => r.capability === 'video.textToVideo')?.status).toBe('not_configured');
  });
});
