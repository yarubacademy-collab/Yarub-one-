import { AppError, CAPABILITIES, type Capability, type Locale } from '@yarub/shared';
import type { TextProvider } from '@yarub/providers';
import { safeJson } from '../intent/resolver.js';
import type { Intent } from '../intent/types.js';
import { planSchema, type Plan } from './plan.schema.js';

/**
 * Step 3 of the pipeline.
 *
 * The Planner writes the task graph. Its output is an LLM response, therefore
 * untrusted: it is schema-validated, cycle-checked and capability-checked
 * before anything executes. One repair attempt is allowed; after that the job
 * fails with a clear error rather than running a half-understood plan.
 */

function instruction(available: readonly Capability[]): string {
  return `You are the planning component of YARUB ONE. Produce an execution plan as JSON only.

Available capabilities (use no others): ${available.join(', ')}
All capabilities: ${CAPABILITIES.join(', ')}

Schema:
{
  "title":   { "ar": "...", "ur": "...", "en": "..." },
  "domain":  the request domain,
  "language": "ar" | "ur" | "en",
  "outputArtifactType": "message" | "document" | "website" | "game" | "image-set" | "video",
  "steps": [
    {
      "id": "lowercase-id",
      "title": { "ar": "...", "ur": "...", "en": "..." },
      "capability": one of the available capabilities,
      "input": { "promptTemplate": "...", "dependsOnOutputs": ["earlier-step-id"] },
      "output": { "kind": "text" | "json" | "image" | "video" | "file" },
      "optional": false
    }
  ],
  "edges": []
}

Rules:
- Step titles are shown to the user. Write them as plain progress labels in all three languages.
- Never mention a model, provider, vendor or API in any title or prompt.
- Reference an earlier step's result inside promptTemplate as {{step-id}}.
- Order steps so every dependency appears before its dependants. No cycles.
- Prefer the fewest steps that genuinely produce the artifact. Maximum 30.
- Mark a step optional only if the artifact is still usable without it.
- Output raw JSON. No markdown fences, no commentary.`;
}

export interface PlannerDeps {
  textProvider: TextProvider;
  /** Capabilities with a configured, healthy provider right now. */
  availableCapabilities: readonly Capability[];
}

export class Planner {
  constructor(private readonly deps: PlannerDeps) {}

  async plan(intent: Intent, rawRequest: string): Promise<Plan> {
    const first = await this.ask(intent, rawRequest, instruction(this.deps.availableCapabilities));
    const parsed = planSchema.safeParse(first);
    if (parsed.success) return this.postValidate(parsed.data, intent.language);

    const problems = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');

    const repaired = await this.ask(
      intent,
      rawRequest,
      `${instruction(this.deps.availableCapabilities)}

Your previous output was rejected by validation. Fix exactly these problems and return corrected JSON:
${problems}`,
    );

    const second = planSchema.safeParse(repaired);
    if (!second.success) {
      throw new AppError(
        'PLAN_INVALID',
        `Planner failed validation twice: ${problems}`,
        'درخواست کو قابلِ عمل مراحل میں تبدیل نہیں کیا جا سکا۔ براہِ کرم اسے مختصر یا واضح کریں۔',
      );
    }
    return this.postValidate(second.data, intent.language);
  }

  private async ask(intent: Intent, rawRequest: string, system: string): Promise<unknown> {
    const res = await this.deps.textProvider.generate({
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: JSON.stringify({
            request: rawRequest.slice(0, 8000),
            domain: intent.domain,
            language: intent.language,
            goal: intent.goal,
            entities: intent.entities,
          }),
        },
      ],
      language: intent.language,
      temperature: 0.2,
      maxOutputTokens: 4000,
    });
    return safeJson(res.text);
  }

  /**
   * Semantic checks the schema cannot express: the plan must not require a
   * capability that has no configured provider, and its language must match
   * the detected one.
   */
  private postValidate(plan: Plan, language: Locale): Plan {
    const missing = [
      ...new Set(
        plan.steps
          .filter((s) => !this.deps.availableCapabilities.includes(s.capability))
          .map((s) => s.capability),
      ),
    ];

    if (missing.length > 0) {
      const allRequiredMissing = plan.steps
        .filter((s) => !s.optional)
        .every((s) => missing.includes(s.capability));

      if (allRequiredMissing) {
        throw new AppError(
          'NOT_CONFIGURED',
          `Plan requires unconfigured capabilities: ${missing.join(', ')}`,
          'اس کام کے لیے درکار صلاحیتیں ابھی configure نہیں ہوئیں۔',
        );
      }
      // Otherwise the orchestrator marks those steps NOT_CONFIGURED and the
      // rest of the artifact is still produced. It never substitutes a fake.
    }

    return { ...plan, language };
  }
}

/** Substitute {{step-id}} references with completed step outputs. */
export function renderPromptTemplate(
  template: string,
  outputs: ReadonlyMap<string, string>,
): string {
  return template.replace(/\{\{([a-z0-9_-]+)\}\}/gi, (match, id: string) => {
    const value = outputs.get(id);
    return value ?? match;
  });
}
