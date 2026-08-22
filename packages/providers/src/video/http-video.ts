import { LOCALES, AppError, type Capability, type CapabilityStatus, type Locale } from '@yarub/shared';
import type { GeneratedBinary, QualityTier, VideoProvider, VideoRequest } from '../contracts/index.js';

export interface HttpVideoOptions {
  id: string;
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string | undefined;
  costWeight: number;
}

const CAPS: readonly Capability[] = ['video.textToVideo', 'video.imageToVideo'];

/**
 * Video generation is slow and expensive, so this adapter is ticket-based by
 * contract: submit returns immediately, the worker polls. No HTTP request is
 * ever held open for the length of a render.
 */
export class HttpVideoProvider implements VideoProvider {
  readonly id: string;
  readonly capabilities = CAPS;
  readonly languages: readonly Locale[] = LOCALES;
  readonly tier: QualityTier = 'quality';
  readonly costWeight: number;

  constructor(private readonly opts: HttpVideoOptions) {
    this.id = opts.id;
    this.costWeight = opts.costWeight;
  }

  private get configured(): boolean {
    return Boolean(this.opts.apiKey && this.opts.baseUrl && this.opts.model);
  }

  async health(): Promise<CapabilityStatus> {
    return this.configured ? 'available' : 'not_configured';
  }

  async submit(req: VideoRequest): Promise<{ ticketId: string }> {
    if (!this.configured) {
      throw new AppError(
        'NOT_CONFIGURED',
        `Video provider ${this.id} is missing credentials`,
        'ویڈیو بنانے کی صلاحیت ابھی configure نہیں ہوئی۔',
      );
    }

    const res = await fetch(`${this.opts.baseUrl}/video/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({
        model: this.opts.model,
        prompt: req.prompt,
        duration: req.durationSeconds,
        aspect_ratio: req.aspectRatio,
        ...(req.sourceImage
          ? { image: Buffer.from(req.sourceImage).toString('base64') }
          : {}),
      }),
    });

    if (!res.ok) {
      throw new AppError('PROVIDER_FAILED', `Video submit failed: ${res.status}`, 'ویڈیو کی درخواست ناکام رہی۔');
    }

    const data = (await res.json()) as { id?: string; ticket_id?: string };
    const ticketId = data.id ?? data.ticket_id;
    if (!ticketId) throw new AppError('PROVIDER_FAILED', 'Video provider returned no ticket id');
    return { ticketId };
  }

  async poll(ticketId: string) {
    const res = await fetch(`${this.opts.baseUrl}/video/generations/${ticketId}`, {
      headers: { Authorization: `Bearer ${this.opts.apiKey}` },
    });

    if (!res.ok) {
      return { status: 'failed' as const, reason: `poll returned ${res.status}` };
    }

    const data = (await res.json()) as {
      status: string;
      progress?: number;
      output?: { b64?: string; url?: string };
      error?: string;
    };

    if (data.status === 'succeeded' && data.output?.b64) {
      return {
        status: 'succeeded' as const,
        result: {
          bytes: Uint8Array.from(Buffer.from(data.output.b64, 'base64')),
          mime: 'video/mp4',
          providerId: this.id,
        } satisfies GeneratedBinary,
      };
    }

    if (data.status === 'succeeded' && data.output?.url) {
      const file = await fetch(data.output.url);
      return {
        status: 'succeeded' as const,
        result: {
          bytes: new Uint8Array(await file.arrayBuffer()),
          mime: 'video/mp4',
          providerId: this.id,
        } satisfies GeneratedBinary,
      };
    }

    if (data.status === 'failed') {
      return { status: 'failed' as const, reason: data.error ?? 'unknown' };
    }

    return {
      status: (data.status === 'running' ? 'running' : 'pending') as 'running' | 'pending',
      progress: data.progress ?? 0,
    };
  }
}
