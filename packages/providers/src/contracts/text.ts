import type { Locale } from '@yarub/shared';
import type { Provider } from './base.js';

export interface TextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TextRequest {
  messages: TextMessage[];
  language: Locale;
  maxOutputTokens?: number;
  temperature?: number;
  /** When set, the provider is asked to emit JSON matching this JSON Schema. */
  jsonSchema?: unknown;
  signal?: AbortSignal;
}

export interface TextUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface TextResponse {
  text: string;
  usage: TextUsage;
  providerId: string;
}

export interface TextChunk {
  delta: string;
  done: boolean;
}

export interface TextProvider extends Provider {
  generate(req: TextRequest): Promise<TextResponse>;
  stream(req: TextRequest): AsyncIterable<TextChunk>;
}
