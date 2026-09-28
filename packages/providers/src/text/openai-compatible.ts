import { LOCALES, type Capability, type CapabilityStatus, type Locale } from '@yarub/shared';
import { AppError } from '@yarub/shared';
import type {
  QualityTier,
  TextChunk,
  TextProvider,
  TextRequest,
  TextResponse,
} from '../contracts/index.js';

export interface OpenAICompatibleOptions {
  id: string;
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string | undefined;
  tier: QualityTier;
  costWeight: number;
}

// `code.generate` is served by the same language model as text. It was missing from
// this list, so no provider advertised it and every website or game step was
// skipped as "not configured" no matter how the model was set up.
const TEXT_CAPABILITIES: readonly Capability[] = [
  'text.generate',
  'text.reason',
  'text.translate',
  'code.generate',
];

/**
 * Adapter for any endpoint speaking the widely-used /chat/completions shape.
 * Covers a large share of hosted and self-hosted models, so swapping vendors
 * is usually a configuration change rather than a code change.
 */
export class OpenAICompatibleTextProvider implements TextProvider {
  readonly id: string;
  readonly capabilities = TEXT_CAPABILITIES;
  readonly languages: readonly Locale[] = LOCALES;
  readonly tier: QualityTier;
  readonly costWeight: number;

  constructor(private readonly opts: OpenAICompatibleOptions) {
    this.id = opts.id;
    this.tier = opts.tier;
    this.costWeight = opts.costWeight;
  }

  private get configured(): boolean {
    return Boolean(this.opts.apiKey && this.opts.baseUrl && this.opts.model);
  }

  async health(): Promise<CapabilityStatus> {
    if (!this.configured) return 'not_configured';
    try {
      const res = await fetch(`${this.opts.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.opts.apiKey}` },
        signal: AbortSignal.timeout(5_000),
      });
      return res.ok ? 'available' : 'degraded';
    } catch {
      return 'degraded';
    }
  }

  private body(req: TextRequest, stream: boolean): string {
    return JSON.stringify({
      model: this.opts.model,
      messages: req.messages,
      max_tokens: req.maxOutputTokens ?? 4096,
      temperature: req.temperature ?? 0.7,
      stream,
      ...(req.jsonSchema
        ? { response_format: { type: 'json_schema', json_schema: req.jsonSchema } }
        : {}),
    });
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new AppError(
        'NOT_CONFIGURED',
        `Provider ${this.id} is missing credentials`,
        'یہ صلاحیت ابھی configure نہیں ہوئی۔',
      );
    }
  }

  async generate(req: TextRequest): Promise<TextResponse> {
    this.assertConfigured();
    const res = await fetch(`${this.opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: this.body(req, false),
      ...(req.signal ? { signal: req.signal } : {}),
    });

    if (!res.ok) {
      // Provider detail stays server-side; the user sees a safe message.
      throw new AppError(
        'PROVIDER_FAILED',
        `Text provider ${this.id} returned ${res.status}: ${await res.text()}`,
        'تیاری مکمل نہیں ہو سکی۔ دوبارہ کوشش کریں۔',
      );
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      text: data.choices[0]?.message.content ?? '',
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      providerId: this.id,
    };
  }

  async *stream(req: TextRequest): AsyncIterable<TextChunk> {
    this.assertConfigured();
    const res = await fetch(`${this.opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: this.body(req, true),
      ...(req.signal ? { signal: req.signal } : {}),
    });

    if (!res.ok || !res.body) {
      throw new AppError(
        'PROVIDER_FAILED',
        `Text provider ${this.id} stream failed with ${res.status}`,
        'تیاری مکمل نہیں ہو سکی۔ دوبارہ کوشش کریں۔',
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          yield { delta: '', done: true };
          return;
        }
        try {
          const parsed = JSON.parse(payload) as {
            choices: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices[0]?.delta?.content;
          if (delta) yield { delta, done: false };
        } catch {
          // Ignore keep-alive and malformed frames.
        }
      }
    }
    yield { delta: '', done: true };
  }
}
