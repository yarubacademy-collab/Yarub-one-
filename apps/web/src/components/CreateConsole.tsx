'use client';

import { useRef, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUp, Square } from 'lucide-react';
import type { Locale } from '@yarub/shared';
import { JobProgress } from './JobProgress';

interface PlanView {
  title: string;
  steps: Array<{ id: string; title: string; capability: string }>;
}

interface ThreadEntry {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * The primary entry point: one box, any request, any of the three languages.
 *
 * The user never picks a mode. What comes back — an answer, a question, or a
 * running project — is the Core's decision, not a setting.
 *
 * Exchanges accumulate in a running thread rather than replacing one another,
 * so an earlier question and answer stay visible while a new one is asked —
 * the ordinary expectation for a chat surface.
 */
export function CreateConsole({ locale }: { locale: Locale }) {
  const t = useTranslations('create');
  const tError = useTranslations('error');

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<ThreadEntry[]>([]);
  const [question, setQuestion] = useState('');
  const [job, setJob] = useState<{ jobId: string; plan: PlanView } | null>(null);
  const [error, setError] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  // Holds the in-flight request so the stop button can cancel it. A ref, not
  // state, because starting or aborting it should never itself trigger a
  // re-render.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread, question, job]);

  /** Cancels the in-flight request. Whatever text has streamed in stays in the thread. */
  function stop() {
    abortRef.current?.abort();
  }

  async function submit() {
    const message = input.trim();
    if (!message || busy) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setBusy(true);
    setInput('');
    setQuestion('');
    setJob(null);
    setError('');
    setThread((prev) => [...prev, { role: 'user', content: message }]);

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: message, locale }),
        signal: controller.signal,
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
      await streamAnswer(message, controller.signal);
    } catch (err) {
      // A user-initiated stop throws AbortError; that is success, not failure.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(tError('generic'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function streamAnswer(message: string, signal: AbortSignal) {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, locale }),
      signal,
    });

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('event-stream')) {
      const data = await res.json();
      if (data.kind === 'clarify') setQuestion(data.question);
      return;
    }

    // Reserve the assistant's place in the thread now, and grow its content
    // in place as chunks arrive, rather than holding the answer outside the
    // thread until it finishes.
    setThread((prev) => [...prev, { role: 'assistant', content: '' }]);

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
        if (parsed.delta) {
          const delta = parsed.delta;
          setThread((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + delta };
            }
            return next;
          });
        }
      }
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10 flex flex-col min-h-[calc(100vh-4rem)]">
      <h1 className="text-2xl md:text-3xl font-bold mb-6">{t('heading')}</h1>

      <div className="flex-1 space-y-4 mb-6">
        {thread.map((entry, i) => (
          <div
            key={i}
            className={`y-card p-4 max-w-[85%] whitespace-pre-wrap ${
              entry.role === 'user' ? 'ms-auto bg-amber-deep/20 border-amber-deep/40' : ''
            }`}
          >
            {entry.content}
          </div>
        ))}

        {question && <p className="y-card p-5">{question}</p>}
        {job && <JobProgress jobId={job.jobId} steps={job.plan.steps} />}
        {error && <p className="text-danger text-sm">{error}</p>}

        <div ref={bottomRef} />
      </div>

      <div className="y-card p-4 sticky bottom-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
          }}
          placeholder={t('placeholder')}
          rows={3}
          className="w-full resize-none bg-transparent outline-none placeholder:text-ink-muted/60"
        />
        <div className="flex justify-end pt-3 border-t border-edge">
          {busy ? (
            <button
              onClick={stop}
              aria-label="Stop"
              className="w-9 h-9 rounded-full flex items-center justify-center bg-ink text-parchment hover:bg-ink-soft transition-colors"
            >
              <Square className="w-4 h-4" fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => void submit()}
              disabled={!input.trim()}
              aria-label={t('submit')}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-ink text-parchment hover:bg-ink-soft transition-colors disabled:opacity-40"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
