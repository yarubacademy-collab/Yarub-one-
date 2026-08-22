import type { AppConfig } from '@yarub/config';
import { ProviderRegistry } from './registry.js';
import { OpenAICompatibleTextProvider } from './text/openai-compatible.js';
import { HttpImageProvider } from './image/http-image.js';
import { HttpVideoProvider } from './video/http-video.js';
import { HttpSpeechProvider } from './speech/http-speech.js';
import { HttpEmbeddingProvider } from './embedding/http-embedding.js';
import { resolveCredentials } from './provider-config.js';

/**
 * Builds the registry from configuration.
 *
 * Providers with missing credentials are still registered, so the Settings
 * screen can show them as "not configured" rather than pretending the
 * capability does not exist. Nothing here fabricates availability.
 */
export function buildRegistry(config: AppConfig): ProviderRegistry {
  const registry = new ProviderRegistry();

  registry.register(
    new OpenAICompatibleTextProvider({
      id: 'text-primary',
      apiKey: config.TEXT_PRIMARY_API_KEY,
      baseUrl: config.TEXT_PRIMARY_BASE_URL,
      model: config.TEXT_PRIMARY_MODEL,
      tier: 'quality',
      costWeight: 10,
    }),
  );

  registry.register(
    new OpenAICompatibleTextProvider({
      id: 'text-fallback',
      apiKey: config.TEXT_FALLBACK_API_KEY,
      baseUrl: config.TEXT_FALLBACK_BASE_URL,
      model: config.TEXT_FALLBACK_MODEL,
      tier: 'fast',
      costWeight: 3,
    }),
  );

  registry.register(
    new HttpImageProvider({
      id: 'image-primary',
      apiKey: config.IMAGE_API_KEY,
      baseUrl: config.IMAGE_BASE_URL,
      model: config.IMAGE_MODEL,
      tier: 'quality',
      costWeight: 40,
    }),
  );

  registry.register(
    new HttpVideoProvider({
      id: 'video-primary',
      apiKey: config.VIDEO_API_KEY,
      baseUrl: config.VIDEO_BASE_URL,
      model: config.VIDEO_MODEL,
      costWeight: 400,
    }),
  );

  registry.register(
    new HttpEmbeddingProvider({
      id: 'embedding-primary',
      apiKey: config.EMBEDDING_API_KEY,
      baseUrl: config.EMBEDDING_BASE_URL,
      model: config.EMBEDDING_MODEL,
      costWeight: 1,
    }),
  );

  registry.register(
    new HttpSpeechProvider({
      id: 'speech-primary',
      apiKey: config.SPEECH_API_KEY,
      baseUrl: config.SPEECH_BASE_URL,
      ttsModel: config.SPEECH_TTS_MODEL,
      sttModel: config.SPEECH_STT_MODEL,
      costWeight: 15,
    }),
  );

  return registry;
}

/**
 * Registry with Settings-managed credentials layered over the environment.
 *
 * `buildRegistry` remains the environment-only path for contexts without a
 * database — tests, boot-time checks, and the CLI. This variant is what the
 * running application uses.
 *
 * Credentials are spread field by field rather than by object spread, so a
 * bookkeeping field like `enabled` can never leak into an adapter's options
 * and silently become part of a request.
 */
export async function buildRegistryWithOverrides(
  config: import('@yarub/config').AppConfig,
): Promise<ProviderRegistry> {
  const registry = new ProviderRegistry();

  const [textPrimary, textFallback, image, video, speech, embedding] = await Promise.all([
    resolveCredentials(config, 'text-primary'),
    resolveCredentials(config, 'text-fallback'),
    resolveCredentials(config, 'image-primary'),
    resolveCredentials(config, 'video-primary'),
    resolveCredentials(config, 'speech-primary'),
    resolveCredentials(config, 'embedding-primary'),
  ]);

  registry.register(
    new OpenAICompatibleTextProvider({
      id: 'text-primary',
      apiKey: textPrimary.apiKey,
      baseUrl: textPrimary.baseUrl,
      model: textPrimary.model,
      tier: 'quality',
      costWeight: textPrimary.costWeight,
    }),
  );

  registry.register(
    new OpenAICompatibleTextProvider({
      id: 'text-fallback',
      apiKey: textFallback.apiKey,
      baseUrl: textFallback.baseUrl,
      model: textFallback.model,
      tier: 'fast',
      costWeight: textFallback.costWeight,
    }),
  );

  registry.register(
    new HttpImageProvider({
      id: 'image-primary',
      apiKey: image.apiKey,
      baseUrl: image.baseUrl,
      model: image.model,
      tier: 'quality',
      costWeight: image.costWeight,
    }),
  );

  registry.register(
    new HttpVideoProvider({
      id: 'video-primary',
      apiKey: video.apiKey,
      baseUrl: video.baseUrl,
      model: video.model,
      costWeight: video.costWeight,
    }),
  );

  registry.register(
    new HttpSpeechProvider({
      id: 'speech-primary',
      apiKey: speech.apiKey,
      baseUrl: speech.baseUrl,
      ttsModel: speech.model,
      sttModel: speech.sttModel,
      costWeight: speech.costWeight,
    }),
  );

  registry.register(
    new HttpEmbeddingProvider({
      id: 'embedding-primary',
      apiKey: embedding.apiKey,
      baseUrl: embedding.baseUrl,
      model: embedding.model,
      costWeight: embedding.costWeight,
    }),
  );

  return registry;
}
