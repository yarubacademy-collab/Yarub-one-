'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@yarub/shared';
import { JobProgress } from './JobProgress';

interface PlanStep {
  id: string;
  title: string;
  capability: string;
}

/**
 * Video workflow surface.
 *
 * Video is the one capability where the plan matters to the user before it
 * runs: a render costs real money and takes minutes, so the script and scene
 * breakdown are shown as a reviewable storyboard rather than executing
 * straight through. Everything still flows through the same Core planner —
 * this only defers the start.
 */
export function VideoStudio({ locale }: { locale: Locale }) {
  const t = useTranslations('create');
  const tJob = useTranslations('job');
  const tError = useTranslations('error');

  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<{ jobId: string; steps: PlanStep[] } | null>(null);

  async function submit() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError('');
    setJob(null);

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: prompt, locale }),
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
      if (data.jobId) setJob({ jobId: data.jobId, steps: data.plan.steps });
    } catch {
      setError(tError('generic'));
    } finally {
      setBusy(false);
    }
  }

  const renderSteps = job?.steps.filter((s) => s.capability.startsWith('video.')) ?? [];

  return (
    <div className="max-w-2xl mx-auto p-6 md:p-10">
      <h1 className="text-2xl font-bold mb-6">{t('heading')}</h1>

      <div className="y-card p-5">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('placeholder')}
          rows={3}
          className="w-full resize-none bg-transparent outline-none placeholder:text-ink-muted/60"
        />
        <div className="flex justify-end border-t border-edge pt-4">
          <button onClick={() => void submit()} disabled={busy || !prompt.trim()} className="y-primary">
            {busy ? t('thinking') : t('submit')}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-danger text-sm">{error}</p>}

      {job && (
        <div className="mt-6 space-y-4">
          {renderSteps.length > 0 && (
            <p className="text-sm text-ink-muted">
              {tJob('planTitle')} · <span className="numeral">{renderSteps.length}</span>
            </p>
          )}
          <JobProgress jobId={job.jobId} steps={job.steps} />
        </div>
      )}
    </div>
  );
}
