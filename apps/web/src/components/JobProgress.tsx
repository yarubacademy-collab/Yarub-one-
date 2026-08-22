'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface StepView {
  id: string;
  title: string;
  /** Absent until the first progress event arrives. */
  status?: string;
}

const DOT: Record<string, string> = {
  pending: 'bg-edge',
  running: 'bg-amber animate-pulse',
  succeeded: 'bg-ink',
  failed: 'bg-danger',
  skipped: 'bg-edge',
  not_configured: 'bg-amber-deep',
};

/**
 * What the user watches while a project builds.
 *
 * Step titles arrive already localized from the plan. No model name, token
 * count or provider error is ever shown here — only what is being made.
 */
export function JobProgress({ jobId, steps }: { jobId: string; steps: StepView[] }) {
  const t = useTranslations('job');
  const [status, setStatus] = useState('running');
  const [progress, setProgress] = useState(0);
  const [stepStatus, setStepStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    const source = new EventSource(`/api/jobs/${jobId}/events`);
    source.onmessage = (event) => {
      const data = JSON.parse(event.data) as {
        status: string;
        progress: number;
        steps: Array<{ stepKey: string; status: string }>;
      };
      setStatus(data.status);
      setProgress(data.progress);
      setStepStatus(Object.fromEntries(data.steps.map((s) => [s.stepKey, s.status])));
      if (['succeeded', 'failed', 'cancelled'].includes(data.status)) source.close();
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [jobId]);

  const cancel = () => {
    void fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
  };

  return (
    <section className="y-card p-6">
      <header className="flex items-center justify-between mb-5">
        <h2 className="font-bold">{t('planTitle')}</h2>
        <span className="text-sm text-ink-muted numeral">{progress}%</span>
      </header>

      <ol className="space-y-3">
        {steps.map((step) => {
          const state = stepStatus[step.id] ?? step.status ?? 'pending';
          return (
            <li key={step.id} className="flex items-center gap-3">
              <span className={`y-step-dot ${DOT[state] ?? 'bg-edge'}`} aria-hidden />
              <span className="flex-1 min-w-0 truncate">{step.title}</span>
              <span className="text-xs text-ink-muted">{t(`step.${state}`)}</span>
            </li>
          );
        })}
      </ol>

      {!['succeeded', 'failed', 'cancelled'].includes(status) && (
        <button onClick={cancel} className="mt-6 text-sm text-danger hover:underline">
          {t('cancel')}
        </button>
      )}
    </section>
  );
}
