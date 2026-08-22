import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryCheckpointStore,
  Orchestrator,
  type StepExecutor,
} from '../packages/ai-core/src/orchestrator/orchestrator';
import { planSchema } from '../packages/ai-core/src/planner/plan.schema';
import { AppError } from '../packages/shared/src/result';

const L = (s: string) => ({ ar: s, ur: s, en: s });

const makePlan = (steps: Array<{ id: string; deps?: string[]; cap?: string; optional?: boolean }>) =>
  planSchema.parse({
    title: L('test plan'),
    domain: 'document',
    language: 'ar',
    outputArtifactType: 'document',
    edges: [],
    steps: steps.map((s) => ({
      id: s.id,
      title: L(s.id),
      capability: s.cap ?? 'text.generate',
      input: { promptTemplate: `run ${s.id}`, dependsOnOutputs: s.deps ?? [] },
      output: { kind: 'text' },
      optional: s.optional ?? false,
    })),
  });

const textExecutor = (impl: (id: string) => Promise<string>): StepExecutor => ({
  supports: (c) => c === 'text.generate',
  execute: async (ctx) => ({
    outputRef: await impl(ctx.step.id),
    providerId: 'test-provider',
    units: 1,
  }),
});

describe('orchestrator', () => {
  it('executes a dependency chain in order and collects outputs', async () => {
    const store = new InMemoryCheckpointStore();
    const seen: string[] = [];
    const orchestrator = new Orchestrator({
      store,
      executors: [textExecutor(async (id) => { seen.push(id); return `out-${id}`; })],
      availableCapabilities: ['text.generate'],
    });

    const outcome = await orchestrator.run('job1', makePlan([
      { id: 'a' }, { id: 'b', deps: ['a'] },
    ]));

    expect(seen).toEqual(['a', 'b']);
    expect(outcome.status).toBe('succeeded');
    expect(outcome.outputs.get('b')).toBe('out-b');
  });

  it('does not re-run completed steps when a job resumes', async () => {
    const store = new InMemoryCheckpointStore();
    const plan = makePlan([{ id: 'a' }, { id: 'b', deps: ['a'] }, { id: 'c', deps: ['b'] }]);
    let failOnC = true;
    const runs: string[] = [];

    const executor = textExecutor(async (id) => {
      runs.push(id);
      if (id === 'c' && failOnC) throw new AppError('VALIDATION_FAILED', 'boom');
      return `out-${id}`;
    });

    const orchestrator = new Orchestrator({
      store, executors: [executor], availableCapabilities: ['text.generate'],
    });

    const first = await orchestrator.run('job2', plan);
    expect(first.status).toBe('failed');

    failOnC = false;
    runs.length = 0;
    const second = await orchestrator.run('job2', plan);

    // a and b were checkpointed; only c is retried.
    expect(runs).toEqual(['c']);
    expect(second.status).toBe('succeeded');
  });

  it('retries a recoverable provider failure', async () => {
    const store = new InMemoryCheckpointStore();
    let attempts = 0;
    const orchestrator = new Orchestrator({
      store,
      executors: [textExecutor(async () => {
        attempts += 1;
        if (attempts < 3) throw new AppError('PROVIDER_FAILED', 'flaky');
        return 'ok';
      })],
      availableCapabilities: ['text.generate'],
      maxAttempts: 3,
    });

    const outcome = await orchestrator.run('job3', makePlan([{ id: 'a' }]));
    expect(attempts).toBe(3);
    expect(outcome.status).toBe('succeeded');
  });

  it('does not retry a validation failure', async () => {
    const store = new InMemoryCheckpointStore();
    let attempts = 0;
    const orchestrator = new Orchestrator({
      store,
      executors: [textExecutor(async () => {
        attempts += 1;
        throw new AppError('VALIDATION_FAILED', 'bad input');
      })],
      availableCapabilities: ['text.generate'],
    });

    await orchestrator.run('job4', makePlan([{ id: 'a' }]));
    expect(attempts).toBe(1);
  });

  it('marks an unconfigured capability instead of faking output', async () => {
    const store = new InMemoryCheckpointStore();
    const orchestrator = new Orchestrator({
      store,
      executors: [textExecutor(async () => 'text')],
      availableCapabilities: ['text.generate'],
    });

    const outcome = await orchestrator.run('job5', makePlan([
      { id: 'text' },
      { id: 'picture', cap: 'image.generate', optional: true },
    ]));

    expect(outcome.status).toBe('partial');
    expect(outcome.notConfigured).toContain('image.generate');
    expect(outcome.outputs.has('picture')).toBe(false);
  });

  it('stops at the next step boundary when cancelled', async () => {
    const store = new InMemoryCheckpointStore();
    const orchestrator = new Orchestrator({
      store,
      executors: [textExecutor(async (id) => {
        if (id === 'a') store.cancel('job6');
        return `out-${id}`;
      })],
      availableCapabilities: ['text.generate'],
    });

    const outcome = await orchestrator.run('job6', makePlan([{ id: 'a' }, { id: 'b', deps: ['a'] }]));
    expect(outcome.status).toBe('cancelled');
    expect(outcome.outputs.has('b')).toBe(false);
  });

  it('reports progress as steps complete', async () => {
    const store = new InMemoryCheckpointStore();
    const events: number[] = [];
    const orchestrator = new Orchestrator({
      store,
      executors: [textExecutor(async (id) => `out-${id}`)],
      availableCapabilities: ['text.generate'],
      onProgress: (e) => { events.push(e.percent); },
    });

    await orchestrator.run('job7', makePlan([{ id: 'a' }, { id: 'b', deps: ['a'] }]));
    expect(events.at(-1)).toBe(100);
  });
});
