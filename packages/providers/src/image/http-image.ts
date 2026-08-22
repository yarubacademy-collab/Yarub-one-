import { LOCALES, AppError, type Capability, type CapabilityStatus, type Locale } from '@yarub/shared';
import type { GeneratedBinary, ImageProvider, ImageRequest, QualityTier } from '../contracts/index.js';

export interface HttpImageOptions {
  id: string;
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string | undefined;
  tier: QualityTier;
  costWeight: number;
}

const CAPS: readonly Capability[] = ['image.generate', 'image.edit'];

/**
 * Image adapter for the common OpenAI-style /images endpoints, which several
 * hosted and self-hosted image services implement. Vendors that differ get
 * their own adapter file; the Core is unaffected either way.
 */
export class HttpImageProvider implements ImageProvider {
  readonly id: string;
  readonly capabilities = CAPS;
  readonly languages: readonly Locale[] = LOCALES;
  readonly tier: QualityTier;
  readonly costWeight: number;

  constructor(private readonly opts: HttpImageOptions) {
    this.id = opts.id;
    this.tier = opts.tier;
    this.costWeight = opts.costWeight;
  }

  private get configured(): boolean {
    return Boolean(this.opts.apiKey && this.opts.baseUrl && this.opts.model);
  }

  async health(): Promise<CapabilityStatus> {
    return this.configured ? 'available' : 'not_configured';
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new AppError(
        'NOT_CONFIGURED',
        `Image provider ${this.id} is missing credentials`,
        'تصویر بنانے کی صلاحیت ابھی configure نہیں ہوئی۔',
      );
    }
  }

  async generate(req: ImageRequest): Promise<GeneratedBinary[]> {
    this.assertConfigured();
    const res = await fetch(`${this.opts.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({
        model: this.opts.model,
        prompt: req.prompt,
        n: req.count,
        size: `${req.width}x${req.height}`,
        response_format: 'b64_json',
      }),
      ...(req.signal ? { signal: req.signal } : {}),
    });

    if (!res.ok) {
      throw new AppError(
        'PROVIDER_FAILED',
        `Image provider ${this.id} returned ${res.status}`,
        'تصویر تیار نہیں ہو سکی۔ دوبارہ کوشش کریں۔',
      );
    }

    const data = (await res.json()) as { data: Array<{ b64_json: string }> };
    return data.data.map((item) => ({
      bytes: Uint8Array.from(Buffer.from(item.b64_json, 'base64')),
      mime: 'image/png',
      providerId: this.id,
    }));
  }

  async edit(req: ImageRequest & { source: Uint8Array; mask?: Uint8Array }): Promise<GeneratedBinary[]> {
    this.assertConfigured();
    const form = new FormData();
    form.append('model', this.opts.model!);
    form.append('prompt', req.prompt);
    form.append('n', String(req.count));
    form.append('image', new Blob([toBlobPart(req.source)], { type: 'image/png' }), 'image.png');
    if (req.mask) form.append('mask', new Blob([toBlobPart(req.mask)], { type: 'image/png' }), 'mask.png');

    const res = await fetch(`${this.opts.baseUrl}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.opts.apiKey}` },
      body: form,
      ...(req.signal ? { signal: req.signal } : {}),
    });

    if (!res.ok) {
      throw new AppError(
        'PROVIDER_FAILED',
        `Image edit failed on ${this.id}: ${res.status}`,
        'تصویر میں ترمیم نہیں ہو سکی۔',
      );
    }

    const data = (await res.json()) as { data: Array<{ b64_json: string }> };
    return data.data.map((item) => ({
      bytes: Uint8Array.from(Buffer.from(item.b64_json, 'base64')),
      mime: 'image/png',
      providerId: this.id,
    }));
  }
}

/**
 * A Uint8Array may be backed by a SharedArrayBuffer, which Blob does not
 * accept. Copying into a fresh ArrayBuffer makes the contract exact and
 * avoids handing a shared buffer to an HTTP client.
 */
function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
