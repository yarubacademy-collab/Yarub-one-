import type { Provider } from './base.js';

/** Declared in Phase 1 so the Core can plan against them; implemented in Phases 2-4. */

export interface ImageRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  count: number;
  seed?: number;
  signal?: AbortSignal;
}

export interface GeneratedBinary {
  bytes: Uint8Array;
  mime: string;
  providerId: string;
}

export interface ImageProvider extends Provider {
  generate(req: ImageRequest): Promise<GeneratedBinary[]>;
  edit(req: ImageRequest & { source: Uint8Array; mask?: Uint8Array }): Promise<GeneratedBinary[]>;
}

export interface VideoRequest {
  prompt: string;
  sourceImage?: Uint8Array;
  durationSeconds: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  signal?: AbortSignal;
}

/** Video generation is asynchronous and expensive: always ticket-based. */
export interface VideoProvider extends Provider {
  submit(req: VideoRequest): Promise<{ ticketId: string }>;
  poll(ticketId: string): Promise<
    | { status: 'pending' | 'running'; progress: number }
    | { status: 'succeeded'; result: GeneratedBinary }
    | { status: 'failed'; reason: string }
  >;
}

export interface SpeechProvider extends Provider {
  synthesize(req: { text: string; voice: string }): Promise<GeneratedBinary>;
  transcribe(req: { audio: Uint8Array; mime: string }): Promise<{ text: string }>;
}

export interface EmbeddingRequest {
  inputs: string[];
  signal?: AbortSignal;
}

export interface EmbeddingResponse {
  vectors: number[][];
  tokens: number;
  providerId: string;
}

export interface EmbeddingProvider extends Provider {
  embed(req: EmbeddingRequest): Promise<EmbeddingResponse>;
}
