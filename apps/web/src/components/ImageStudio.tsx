'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@yarub/shared';

/**
 * Image editing surface.
 *
 * Editing needs a source file, which is the one thing the create console
 * cannot express in text — hence a dedicated surface rather than another
 * prompt box. Generation still flows through the same Core pipeline.
 */
export function ImageStudio({ locale, projectId }: { locale: Locale; projectId?: string }) {
  const t = useTranslations('create');
  const tError = useTranslations('error');
  const fileInput = useRef<HTMLInputElement>(null);

  const [prompt, setPrompt] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');

  async function upload(file: File): Promise<string | undefined> {
    if (!projectId) return undefined;
    const form = new FormData();
    form.append('file', file);
    form.append('projectId', projectId);

    const res = await fetch('/api/uploads', { method: 'POST', body: form });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? tError('generic'));
      return undefined;
    }
    const data = (await res.json()) as { assetId: string };
    return data.assetId;
  }

  async function submit() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError('');
    setJobId('');

    try {
      const file = fileInput.current?.files?.[0];
      const assetId = file ? await upload(file) : undefined;
      if (file && !assetId) return;

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: assetId ? `Edit the attached image: ${prompt}` : prompt,
          locale,
          ...(projectId ? { projectId } : {}),
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
        setError(
          body.code === 'NOT_CONFIGURED' ? tError('notConfigured')
          : body.code === 'RATE_LIMITED' ? tError('rateLimited')
          : body.message ?? tError('generic'),
        );
        return;
      }

      const data = await res.json();
      if (data.jobId) setJobId(data.jobId);
    } catch {
      setError(tError('generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 md:p-10">
      <h1 className="text-2xl font-bold mb-6">{t('heading')}</h1>

      <div className="y-card p-5 space-y-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('placeholder')}
          rows={3}
          className="w-full resize-none bg-transparent outline-none placeholder:text-ink-muted/60"
        />

        <div className="flex items-center justify-between gap-4 border-t border-edge pt-4">
          <label className="text-sm text-ink-muted cursor-pointer hover:text-ink">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => setSourceName(e.target.files?.[0]?.name ?? '')}
            />
            <span className="underline">{sourceName || '+'}</span>
          </label>

          <button onClick={() => void submit()} disabled={busy || !prompt.trim()} className="y-primary">
            {busy ? t('thinking') : t('submit')}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-danger text-sm">{error}</p>}
      {jobId && <p className="mt-4 text-sm text-ink-muted numeral">{jobId}</p>}
    </div>
  );
}
