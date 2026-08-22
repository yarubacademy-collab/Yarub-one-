import { describe, expect, it } from 'vitest';
import { planSchema, executionOrder } from '../packages/ai-core/src/planner/plan.schema';

const L = (s: string) => ({ ar: s, ur: s, en: s });

const step = (id: string, deps: string[] = []) => ({
  id,
  title: L(id),
  capability: 'text.generate' as const,
  input: { promptTemplate: `do ${id}`, dependsOnOutputs: deps },
  output: { kind: 'text' as const },
  optional: false,
});

const base = {
  title: L('Arabic children book'),
  domain: 'document' as const,
  language: 'ar' as const,
  outputArtifactType: 'document' as const,
  edges: [],
};

describe('plan schema', () => {
  it('accepts a valid multi-step plan', () => {
    const result = planSchema.safeParse({
      ...base,
      steps: [step('outline'), step('content', ['outline']), step('layout', ['content'])],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a dependency on an unknown step', () => {
    const result = planSchema.safeParse({ ...base, steps: [step('content', ['ghost'])] });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate step ids', () => {
    const result = planSchema.safeParse({ ...base, steps: [step('a'), step('a')] });
    expect(result.success).toBe(false);
  });

  it('rejects a cyclic graph', () => {
    const result = planSchema.safeParse({
      ...base,
      steps: [step('a', ['b']), step('b', ['a'])],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a step title missing a language', () => {
    const broken = { ...step('a'), title: { ar: 'x', en: 'x' } };
    const result = planSchema.safeParse({ ...base, steps: [broken] });
    expect(result.success).toBe(false);
  });

  it('groups independent steps into one parallel wave', () => {
    const plan = planSchema.parse({
      ...base,
      steps: [step('a'), step('b'), step('c', ['a', 'b'])],
    });
    const waves = executionOrder(plan);
    expect(waves).toHaveLength(2);
    expect(waves[0].map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(waves[1].map((s) => s.id)).toEqual(['c']);
  });
});
