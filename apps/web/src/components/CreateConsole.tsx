'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@yarub/shared';
import { JobProgress } from './JobProgress';

interface PlanView {
  title: string;
  steps: Array<{ id: string; title: string; capability: string }>;
}

/**
 * The primary entry point: one box, any request, any of the three languages.
 *
 * The user never picks a mode. What comes back — an answer, a question, or a
 * running project — is the Core's decision, not a setting.
 */
export function CreateConsole({ locale }: { locale: Locale }) {
  const t = useTranslations('create');
  const tError = useTranslations('error');

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [question, setQuestion] = useState('');
  const [job, setJob] = useState<{ jobId: string; plan: PlanView } | null>(null);
  const [error, setError] = useState('');

  async function submit() {
    if (!input.trim() || busy) return;
    setBusy(true);
    setAnswer('');
    setQuestion('');
    setJob(null);
    setError('');

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: input, locale }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { code?: string };
        setError(
          body.code === 'RATE_LIMITED' ? tError('rateLimited')
          : body.code === 'NOT_CONFIGURED' ? tError('notConfigured')
          : body.code === 'UNAUTHORIZED' ? tError('unauthorized')
          : tError('generic'),
        );
        return;
      }

      const data = await res.json();

      if (data.kind === 'project') {
        setJob({ jobId: data.jobId, plan: data.plan });
        return;
      }

      // Simple request: stream the answer instead of creating a project.
      await streamAnswer();
    } catch {
      setError(tError('generic'));
    } finally {
      setBusy(false);
    }
  }

  async function streamAnswer() {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: input, locale }),
    });

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('event-stream')) {
      const data = await res.json();
      if (data.kind === 'clarify') setQuestion(data.question);
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        const parsed = JSON.parse(payload) as { delta?: string; error?: { message: string } };
        if (parsed.error) setError(parsed.error.message);
        if (parsed.delta) setAnswer((prev) => prev + parsed.delta);
      }
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10">
      <h1 className="text-2xl md:text-3xl font-bold mb-6">{t('heading')}</h1>

      <div className="y-card p-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
          }}
          placeholder={t('placeholder')}
          rows={4}
          className="w-full resize-none bg-transparent outline-none placeholder:text-ink-muted/60"
        />
        <div className="flex justify-end pt-3 border-t border-edge">
          <button onClick={() => void submit()} disabled={busy || !input.trim()} className="y-primary">
            {busy ? t('thinking') : t('submit')}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-danger text-sm">{error}</p>}
      {question && <p className="mt-6 y-card p-5">{question}</p>}
      {answer && <article className="mt-6 y-card p-6 whitespace-pre-wrap">{answer}</article>}
      {job && (
        <div className="mt-6">
          <JobProgress jobId={job.jobId} steps={job.plan.steps} />
        </div>
      )}
    </div>
  );
}
