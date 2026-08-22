import {
  AppError,
  CAPABILITIES,
  type Capability,
  type Locale,
  type Localized,
} from '@yarub/shared';
import type { ProviderRegistry, TextProvider } from '@yarub/providers';
import { CapabilityRouter } from './router/capability-router.js';
import { IntentResolver, needsClarification } from './intent/resolver.js';
import type { Intent } from './intent/types.js';
import { Planner } from './planner/planner.js';
import type { Plan } from './planner/plan.schema.js';
import { validateUserPrompt, assertVendorNeutral } from './guardrails/index.js';
import { buildContext, type ProjectContext, type StoredMessage } from './memory/context.js';

/**
 * YARUB ONE AI CORE — the facade the application talks to.
 *
 * Everything above this line is product. Everything below it is capability.
 * The application never sees a provider, a model name or an API.
 */

export interface CoreOptions {
  registry: ProviderRegistry;
  maxPromptChars?: number;
}

export type CoreDecision =
  | { kind: 'clarify'; question: Localized; intent: Intent }
  | { kind: 'answer'; intent: Intent; messages: ReturnType<typeof buildContext> }
  | { kind: 'project'; intent: Intent; plan: Plan };

const CLARIFY_QUESTION: Localized = {
  ar: 'أحتاج تفصيلًا بسيطًا لأفهم المطلوب بدقة. ما الهدف من هذا العمل، ولمن هو موجَّه؟',
  ur: 'درست سمجھنے کے لیے تھوڑی وضاحت درکار ہے۔ یہ کام کس مقصد کے لیے ہے اور کن کے لیے؟',
  en: 'I need one detail to get this right. What is this for, and who is it for?',
};

export class YarubCore {
  readonly router: CapabilityRouter;
  private readonly maxPromptChars: number;

  constructor(private readonly opts: CoreOptions) {
    this.router = new CapabilityRouter(opts.registry);
    this.maxPromptChars = opts.maxPromptChars ?? 24_000;
  }

  /** Capabilities usable right now. Drives both planning and the UI matrix. */
  async capabilities(): Promise<Capability[]> {
    return this.router.availableCapabilities(CAPABILITIES);
  }

  private async textProvider(language: Locale): Promise<TextProvider> {
    const resolved = await this.router.route<TextProvider>('text.reason', language);
    if (!resolved.ok) throw resolved.error;
    return resolved.value;
  }

  /**
   * The decision every request passes through:
   * clarify, answer directly, or become a project.
   */
  async decide(input: {
    rawRequest: string;
    locale: Locale;
    history?: StoredMessage[];
    project?: ProjectContext;
    rollingSummary?: string;
  }): Promise<CoreDecision> {
    const request = validateUserPrompt(input.rawRequest, { maxPromptChars: this.maxPromptChars });

    const provider = await this.textProvider(input.locale);
    const intent = await new IntentResolver({ textProvider: provider }).resolve(request);

    if (needsClarification(intent)) {
      return { kind: 'clarify', question: CLARIFY_QUESTION, intent };
    }

    if (intent.complexity === 'simple') {
      const messages = buildContext({
        locale: intent.language,
        education: intent.domain === 'education',
        messages: [
          ...(input.history ?? []),
          { role: 'user', content: request, createdAt: new Date() },
        ],
        ...(input.project ? { project: input.project } : {}),
        ...(input.rollingSummary ? { rollingSummary: input.rollingSummary } : {}),
      });
      return { kind: 'answer', intent, messages };
    }

    const available = await this.capabilities();
    if (available.length === 0) {
      throw new AppError(
        'NOT_CONFIGURED',
        'No capabilities are configured',
        'ابھی کوئی صلاحیت configure نہیں ہوئی۔ Settings میں provider شامل کریں۔',
      );
    }

    const plan = await new Planner({
      textProvider: provider,
      availableCapabilities: available,
    }).plan(intent, request);

    // The plan's titles are shown to the user; they must stay vendor-neutral.
    for (const step of plan.steps) {
      assertVendorNeutral(step.title.ar);
      assertVendorNeutral(step.title.ur);
      assertVendorNeutral(step.title.en);
    }

    return { kind: 'project', intent, plan };
  }

  /** Direct streaming answer for the simple path. */
  async *streamAnswer(decision: Extract<CoreDecision, { kind: 'answer' }>) {
    const provider = await this.textProvider(decision.intent.language);
    yield* provider.stream({
      messages: decision.messages,
      language: decision.intent.language,
      temperature: 0.7,
    });
  }
}
