import { LOCALES, AppError, type Capability, type CapabilityStatus, type Locale } from '@yarub/shared';
import type { EmbeddingProvider, EmbeddingRequest, EmbeddingResponse, QualityTier } from '../contracts/index.js';

export interface HttpEmbeddingOptions {
  id: string;
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string | undefined;
  costWeight: number;
}

const CAPS: readonly Capability[] = ['embedding.create'];

/**
 * Embeddings.
 *
 * Used for project memory and semantic recall across long conversations rather
 * than as a user-facing feature. Multilingual quality matters more here than
 * anywhere else: an embedding model weak in Arabic makes recall in Arabic
 * projects quietly worse, with no error to notice.
 */
export class HttpEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly capabilities = CAPS;
  readonly languages: readonly Locale[] = LOCALES;
  readonly tier: QualityTier = 'fast';
  readonly costWeight: number;

  constructor(private readonly opts: HttpEmbeddingOptions) {
    this.id = opts.id;
    this.costWeight = opts.costWeight;
  }

  private get configured(): boolean {
    return Boolean(this.opts.apiKey && this.opts.baseUrl && this.opts.model);
  }

  async health(): Promise<CapabilityStatus> {
    return this.configured ? 'available' : 'not_configured';
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    if (!this.configured) {
      throw new AppError(
        'NOT_CONFIGURED',
        `Embedding provider ${this.id} is missing credentials`,
        'یہ صلاحیت ابھی configure نہیں ہوئی۔',
      );
    }

    const res = await fetch(`${this.opts.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({ model: this.opts.model, input: req.inputs }),
      ...(req.signal ? { signal: req.signal } : {}),
    });

    if (!res.ok) {
      throw new AppError(
        'PROVIDER_FAILED',
        `Embedding provider ${this.id} returned ${res.status}`,
        'تیاری مکمل نہیں ہو سکی۔',
      );
    }

    const data = (await res.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
      usage?: { prompt_tokens?: number };
    };

    // Providers do not guarantee response order matches input order.
    const ordered = [...data.data].sort((a, b) => a.index - b.index);

    return {
      vectors: ordered.map((row) => row.embedding),
      tokens: data.usage?.prompt_tokens ?? 0,
      providerId: this.id,
    };
  }
}
