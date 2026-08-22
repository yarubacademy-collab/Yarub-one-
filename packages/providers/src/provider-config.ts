import { prisma } from '@yarub/db';
import { decryptSecret, deriveKey, encryptSecret, maskSecret, type AppConfig } from '@yarub/config';
import { AppError, type Capability } from '@yarub/shared';

/**
 * Provider configuration resolved from two layers.
 *
 * Environment variables are the deployment baseline; rows in ProviderConfig are
 * the owner's overrides set through Settings. The database wins when present,
 * which lets an operator add a provider without a redeploy while keeping a
 * working default in infrastructure-as-code.
 *
 * Plaintext credentials exist only inside this module and the provider adapter
 * that consumes them. Nothing here is ever returned to a browser.
 */

export interface ResolvedProviderCredentials {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string | undefined;
  /** Speech providers need two models; `model` is TTS, this is STT. */
  sttModel: string | undefined;
  enabled: boolean;
  costWeight: number;
}

export interface ProviderCredentialView {
  providerId: string;
  capability: Capability;
  enabled: boolean;
  baseUrl: string | undefined;
  model: string | undefined;
  /** Masked. Never the real key. */
  sttModel: string | undefined;
  keyHint: string | undefined;
  source: 'settings' | 'environment' | 'unset';
}

function key(config: AppConfig) {
  return deriveKey(config.CREDENTIAL_SECRET);
}

/** Env fallbacks, keyed by the provider ids registered in bootstrap. */
function envDefaults(config: AppConfig, providerId: string): ResolvedProviderCredentials {
  const base = { enabled: true, costWeight: 10, sttModel: undefined as string | undefined };
  switch (providerId) {
    case 'text-primary':
      return { ...base, apiKey: config.TEXT_PRIMARY_API_KEY, baseUrl: config.TEXT_PRIMARY_BASE_URL, model: config.TEXT_PRIMARY_MODEL, costWeight: 10 };
    case 'text-fallback':
      return { ...base, apiKey: config.TEXT_FALLBACK_API_KEY, baseUrl: config.TEXT_FALLBACK_BASE_URL, model: config.TEXT_FALLBACK_MODEL, costWeight: 3 };
    case 'image-primary':
      return { ...base, apiKey: config.IMAGE_API_KEY, baseUrl: config.IMAGE_BASE_URL, model: config.IMAGE_MODEL, costWeight: 40 };
    case 'video-primary':
      return { ...base, apiKey: config.VIDEO_API_KEY, baseUrl: config.VIDEO_BASE_URL, model: config.VIDEO_MODEL, costWeight: 400 };
    case 'speech-primary':
      return { ...base, apiKey: config.SPEECH_API_KEY, baseUrl: config.SPEECH_BASE_URL, model: config.SPEECH_TTS_MODEL, sttModel: config.SPEECH_STT_MODEL, costWeight: 15 };
    case 'embedding-primary':
      return { ...base, apiKey: config.EMBEDDING_API_KEY, baseUrl: config.EMBEDDING_BASE_URL, model: config.EMBEDDING_MODEL, costWeight: 1 };
    default:
      return { ...base, apiKey: undefined, baseUrl: undefined, model: undefined };
  }
}

export async function resolveCredentials(
  config: AppConfig,
  providerId: string,
): Promise<ResolvedProviderCredentials> {
  const fallback = envDefaults(config, providerId);

  const row = await prisma.providerConfig.findFirst({ where: { providerId } });
  if (!row) return fallback;

  // A disabled row means the owner switched the provider off deliberately.
  // That is not the same as "unconfigured", but it produces the same honest
  // outcome downstream: the capability reports not_configured.
  if (!row.enabled) {
    return { apiKey: undefined, baseUrl: undefined, model: undefined, sttModel: undefined, enabled: false, costWeight: row.costWeight };
  }

  let apiKey = fallback.apiKey;
  if (row.encryptedApiKey) {
    try {
      apiKey = decryptSecret(row.encryptedApiKey, key(config));
    } catch {
      // A credential that will not decrypt must never fall back to the env
      // value silently — the operator needs to know their key is unreadable.
      throw new AppError(
        'NOT_CONFIGURED',
        `Stored credential for ${providerId} could not be decrypted; CREDENTIAL_SECRET may have changed`,
        'محفوظ کردہ credential پڑھی نہیں جا سکی۔ Settings میں دوبارہ درج کریں۔',
      );
    }
  }

  return {
    apiKey,
    baseUrl: row.baseUrl ?? fallback.baseUrl,
    model: row.model ?? fallback.model,
    sttModel: row.sttModel ?? fallback.sttModel,
    enabled: true,
    costWeight: row.costWeight,
  };
}

export async function saveCredentials(
  config: AppConfig,
  input: {
    providerId: string;
    capability: Capability;
    tier: string;
    baseUrl?: string;
    model?: string;
    sttModel?: string;
    /** Omit to leave the existing key untouched. */
    apiKey?: string;
    enabled?: boolean;
    costWeight?: number;
  },
): Promise<void> {
  const encrypted = input.apiKey ? encryptSecret(input.apiKey, key(config)) : undefined;

  const data = {
    capability: input.capability,
    tier: input.tier,
    baseUrl: input.baseUrl ?? null,
    model: input.model ?? null,
    sttModel: input.sttModel ?? null,
    enabled: input.enabled ?? true,
    costWeight: input.costWeight ?? 10,
    ...(encrypted ? { encryptedApiKey: encrypted, keyHint: maskSecret(input.apiKey!) } : {}),
  };

  await prisma.providerConfig.upsert({
    where: { capability_providerId: { capability: input.capability, providerId: input.providerId } },
    update: data,
    create: { providerId: input.providerId, ...data },
  });
}

/** Safe projection for the Settings screen. */
export async function listCredentialViews(config: AppConfig): Promise<ProviderCredentialView[]> {
  const rows = await prisma.providerConfig.findMany();

  return rows.map((row: (typeof rows)[number]) => {
    const fallback = envDefaults(config, row.providerId);
    return {
      providerId: row.providerId,
      capability: row.capability as Capability,
      enabled: row.enabled,
      baseUrl: row.baseUrl ?? fallback.baseUrl,
      model: row.model ?? fallback.model,
      sttModel: row.sttModel ?? fallback.sttModel,
      keyHint: row.keyHint ?? (fallback.apiKey ? maskSecret(fallback.apiKey) : undefined),
      source: row.encryptedApiKey ? 'settings' : fallback.apiKey ? 'environment' : 'unset',
    };
  });
}
