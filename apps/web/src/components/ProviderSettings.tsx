'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Capability } from '@yarub/shared';

interface ProviderView {
  providerId: string;
  capability: Capability;
  enabled: boolean;
  baseUrl?: string;
  model?: string;
  sttModel?: string;
  keyHint?: string;
  source: 'settings' | 'environment' | 'unset';
}

const SLOTS: Array<{
  providerId: string;
  capability: Capability;
  tier: string;
  /** Speech is the only provider needing a second model field. */
  hasStt?: boolean;
}> = [
  { providerId: 'text-primary', capability: 'text.reason', tier: 'quality' },
  { providerId: 'text-fallback', capability: 'text.generate', tier: 'fast' },
  { providerId: 'image-primary', capability: 'image.generate', tier: 'quality' },
  { providerId: 'video-primary', capability: 'video.textToVideo', tier: 'quality' },
  { providerId: 'speech-primary', capability: 'speech.tts', tier: 'balanced', hasStt: true },
];

/**
 * Credential entry.
 *
 * The key field is write-only: the browser can send a new key but can never
 * read the stored one back, only a masked hint. Leaving it blank saves the URL
 * and model without touching the credential, which is what makes routine edits
 * safe to perform.
 */
export function ProviderSettings() {
  const t = useTranslations('capability');
  const tError = useTranslations('error');

  const [views, setViews] = useState<ProviderView[]>([]);
  const [draft, setDraft] = useState<
    Record<string, { baseUrl: string; model: string; sttModel: string; apiKey: string }>
  >({});
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const res = await fetch('/api/providers');
    if (!res.ok) return;
    const data = (await res.json()) as { providers: ProviderView[] };
    setViews(data.providers);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(slot: (typeof SLOTS)[number]) {
    const values = draft[slot.providerId] ?? { baseUrl: '', model: '', sttModel: '', apiKey: '' };
    setSaving(slot.providerId);
    setError('');

    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: slot.providerId,
          capability: slot.capability,
          tier: slot.tier,
          ...(values.baseUrl ? { baseUrl: values.baseUrl } : {}),
          ...(values.model ? { model: values.model } : {}),
          ...(values.sttModel ? { sttModel: values.sttModel } : {}),
          // Omitted entirely when blank, so the stored key survives.
          ...(values.apiKey ? { apiKey: values.apiKey } : {}),
          enabled: true,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? tError('generic'));
        return;
      }

      setDraft((prev) => ({ ...prev, [slot.providerId]: { ...values, apiKey: '' } }));
      await load();
    } finally {
      setSaving('');
    }
  }

  return (
    <section className="space-y-4">
      {error && <p className="text-danger text-sm">{error}</p>}

      {SLOTS.map((slot) => {
        const current = views.find((v) => v.providerId === slot.providerId);
        const values = draft[slot.providerId] ?? { baseUrl: '', model: '', sttModel: '', apiKey: '' };

        return (
          <div key={slot.providerId} className="y-card p-5 space-y-3">
            <header className="flex items-center justify-between gap-4">
              <h3 className="font-semibold">{t(slot.capability)}</h3>
              <span className="text-xs text-ink-muted">
                {current?.keyHint ?? t('not_configured')}
              </span>
            </header>

            <input
              dir="ltr"
              placeholder="https://api.example.com/v1"
              value={values.baseUrl || current?.baseUrl || ''}
              onChange={(e) =>
                setDraft((p) => ({ ...p, [slot.providerId]: { ...values, baseUrl: e.target.value } }))
              }
              className="w-full rounded-lg border border-edge bg-parchment px-3 py-2 outline-none focus:border-amber text-sm"
            />

            <input
              dir="ltr"
              placeholder="model-name"
              value={values.model || current?.model || ''}
              onChange={(e) =>
                setDraft((p) => ({ ...p, [slot.providerId]: { ...values, model: e.target.value } }))
              }
              className="w-full rounded-lg border border-edge bg-parchment px-3 py-2 outline-none focus:border-amber text-sm"
            />

            {slot.hasStt && (
              <input
                dir="ltr"
                placeholder="speech-to-text model"
                value={values.sttModel || current?.sttModel || ''}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    [slot.providerId]: { ...values, sttModel: e.target.value },
                  }))
                }
                className="w-full rounded-lg border border-edge bg-parchment px-3 py-2 outline-none focus:border-amber text-sm"
              />
            )}

            <input
              dir="ltr"
              type="password"
              autoComplete="off"
              placeholder={current?.keyHint ? '••••••••' : 'API key'}
              value={values.apiKey}
              onChange={(e) =>
                setDraft((p) => ({ ...p, [slot.providerId]: { ...values, apiKey: e.target.value } }))
              }
              className="w-full rounded-lg border border-edge bg-parchment px-3 py-2 outline-none focus:border-amber text-sm"
            />

            <button
              onClick={() => void save(slot)}
              disabled={saving === slot.providerId}
              className="y-primary text-sm"
            >
              {saving === slot.providerId ? '…' : t('available')}
            </button>
          </div>
        );
      })}
    </section>
  );
}
