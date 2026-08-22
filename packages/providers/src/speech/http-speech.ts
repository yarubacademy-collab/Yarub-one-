import { LOCALES, AppError, type Capability, type CapabilityStatus, type Locale } from '@yarub/shared';
import type { GeneratedBinary, QualityTier, SpeechProvider } from '../contracts/index.js';

export interface HttpSpeechOptions {
  id: string;
  apiKey: string | undefined;
  baseUrl: string | undefined;
  ttsModel: string | undefined;
  sttModel: string | undefined;
  costWeight: number;
}

const CAPS: readonly Capability[] = ['speech.tts', 'speech.stt'];

export class HttpSpeechProvider implements SpeechProvider {
  readonly id: string;
  readonly capabilities = CAPS;
  readonly languages: readonly Locale[] = LOCALES;
  readonly tier: QualityTier = 'balanced';
  readonly costWeight: number;

  constructor(private readonly opts: HttpSpeechOptions) {
    this.id = opts.id;
    this.costWeight = opts.costWeight;
  }

  private get configured(): boolean {
    return Boolean(this.opts.apiKey && this.opts.baseUrl);
  }

  async health(): Promise<CapabilityStatus> {
    return this.configured ? 'available' : 'not_configured';
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new AppError(
        'NOT_CONFIGURED',
        `Speech provider ${this.id} is missing credentials`,
        'آواز کی صلاحیت ابھی configure نہیں ہوئی۔',
      );
    }
  }

  async synthesize(req: { text: string; voice: string }): Promise<GeneratedBinary> {
    this.assertConfigured();
    const res = await fetch(`${this.opts.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({ model: this.opts.ttsModel, input: req.text, voice: req.voice }),
    });
    if (!res.ok) throw new AppError('PROVIDER_FAILED', `TTS failed: ${res.status}`, 'آواز تیار نہیں ہو سکی۔');
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      mime: 'audio/mpeg',
      providerId: this.id,
    };
  }

  async transcribe(req: { audio: Uint8Array; mime: string }): Promise<{ text: string }> {
    this.assertConfigured();
    const form = new FormData();
    form.append('model', this.opts.sttModel ?? '');
    form.append('file', new Blob([toBlobPart(req.audio)], { type: req.mime }), 'audio');

    const res = await fetch(`${this.opts.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.opts.apiKey}` },
      body: form,
    });
    if (!res.ok) throw new AppError('PROVIDER_FAILED', `STT failed: ${res.status}`, 'آواز کو متن میں تبدیل نہیں کیا جا سکا۔');
    const data = (await res.json()) as { text: string };
    return { text: data.text };
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
