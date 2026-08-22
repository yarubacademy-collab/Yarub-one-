import { z } from 'zod';
import { CAPABILITIES, DOMAINS, LOCALES } from '@yarub/shared';

/**
 * The contract between the Planner and the Orchestrator.
 *
 * The Planner is an LLM, so its output is untrusted input. Every plan is
 * validated against this schema before a single step runs. An invalid plan
 * gets one repair attempt and then fails loudly — it is never executed
 * partially or guessed at.
 */

export const localizedSchema = z.object({
  ar: z.string().min(1),
  ur: z.string().min(1),
  en: z.string().min(1),
});

export const planStepSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9_-]{1,40}$/, 'step id must be lowercase alphanumeric with - or _'),
  /** Shown to the user during execution. Must never contain a model name. */
  title: localizedSchema,
  capability: z.enum(CAPABILITIES),
  input: z.object({
    promptTemplate: z.string().min(1).max(8000),
    dependsOnOutputs: z.array(z.string()).default([]),
  }),
  output: z.object({
    kind: z.enum(['text', 'json', 'image', 'video', 'file']),
    schemaName: z.string().optional(),
  }),
  /** An optional step may fail without failing the whole plan. */
  optional: z.boolean().default(false),
});

export const planSchema = z
  .object({
    title: localizedSchema,
    domain: z.enum(DOMAINS),
    language: z.enum(LOCALES),
    outputArtifactType: z.enum(['message', 'document', 'website', 'game', 'image-set', 'video']),
    steps: z.array(planStepSchema).min(1).max(30),
    edges: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
  })
  .superRefine((plan, ctx) => {
    const ids = new Set<string>();
    for (const step of plan.steps) {
      if (ids.has(step.id)) {
        ctx.addIssue({ code: 'custom', message: `Duplicate step id: ${step.id}` });
      }
      ids.add(step.id);
    }

    for (const step of plan.steps) {
      for (const dep of step.input.dependsOnOutputs) {
        if (!ids.has(dep)) {
          ctx.addIssue({ code: 'custom', message: `Step ${step.id} depends on unknown ${dep}` });
        }
      }
    }

    for (const edge of plan.edges) {
      if (!ids.has(edge.from) || !ids.has(edge.to)) {
        ctx.addIssue({ code: 'custom', message: `Edge references unknown step` });
      }
    }

    if (hasCycle(plan.steps)) {
      ctx.addIssue({ code: 'custom', message: 'Plan graph contains a cycle' });
    }
  });

export type PlanStep = z.infer<typeof planStepSchema>;
export type Plan = z.infer<typeof planSchema>;

function hasCycle(steps: Array<z.infer<typeof planStepSchema>>): boolean {
  const graph = new Map(steps.map((s) => [s.id, s.input.dependsOnOutputs]));
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (id: string): boolean => {
    const current = state.get(id);
    if (current === 'visiting') return true;
    if (current === 'done') return false;
    state.set(id, 'visiting');
    for (const dep of graph.get(id) ?? []) {
      if (visit(dep)) return true;
    }
    state.set(id, 'done');
    return false;
  };

  return steps.some((s) => visit(s.id));
}

/** Topological order for execution; independent steps stay adjacent for parallelism. */
export function executionOrder(plan: Plan): PlanStep[][] {
  const remaining = new Map(plan.steps.map((s) => [s.id, s]));
  const completed = new Set<string>();
  const waves: PlanStep[][] = [];

  while (remaining.size > 0) {
    const wave = [...remaining.values()].filter((s) =>
      s.input.dependsOnOutputs.every((d) => completed.has(d)),
    );
    if (wave.length === 0) throw new Error('Unresolvable plan dependencies');
    for (const step of wave) {
      remaining.delete(step.id);
      completed.add(step.id);
    }
    waves.push(wave);
  }

  return waves;
}
