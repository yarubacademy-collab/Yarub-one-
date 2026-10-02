'use client';

import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowUp, Square, Mic, Paperclip, PanelLeft, SquarePen } from 'lucide-react';
import type { Locale } from '@yarub/shared';
import { JobProgress } from './JobProgress';
import { ChatHistoryDrawer, HISTORY_TEXT } from './ChatHistoryDrawer';
import { BuilderHistoryDrawer } from './BuilderHistoryDrawer';

interface PlanView {
  title: string;
  steps: Array<{ id: string; title: string; capability: string }>;
}

interface ThreadEntry {
  role: 'user' | 'assistant';
  content: string;
  /** A course ad image sent alongside this answer, if the message matched one. */
  image?: string;
}

// Not every TypeScript lib.dom version ships these types; the API is
// feature-detected at runtime regardless, so a minimal shape is enough here.
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

const RECOGNITION_LANG: Record<Locale, string> = { en: 'en-US', ar: 'ar-SA', ur: 'ur-PK' };

const ACTION_LABEL: Record<Locale, Record<string, string>> = {
  en: { image: 'image', video: 'video', website: 'website', game: 'game', document: 'document' },
  ar: { image: 'صورة', video: 'فيديو', website: 'موقع', game: 'لعبة', document: 'مستند' },
  ur: { image: 'تصویر', video: 'ویڈیو', website: 'ویب سائٹ', game: 'گیم', document: 'دستاویز' },
};

/** At most the two largest non-zero units: "1 day 3 hours", "4 hours 12 minutes", "9 minutes". */
function formatWait(seconds: number, locale: Locale): string {
  const total = Math.max(1, Math.ceil(seconds / 60));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;

  const unit = (n: number, kind: 'day' | 'hour' | 'minute'): string => {
    if (locale === 'ar') return `${n} ${{ day: 'يوم', hour: 'ساعة', minute: 'دقيقة' }[kind]}`;
    if (locale === 'ur') {
      const word = { day: 'دن', hour: n === 1 ? 'گھنٹہ' : 'گھنٹے', minute: 'منٹ' }[kind];
      return `${n} ${word}`;
    }
    return `${n} ${kind}${n === 1 ? '' : 's'}`;
  };

  const parts: string[] = [];
  if (d > 0) {
    parts.push(unit(d, 'day'));
    if (h > 0) parts.push(unit(h, 'hour'));
  } else if (h > 0) {
    parts.push(unit(h, 'hour'));
    if (m > 0) parts.push(unit(m, 'minute'));
  } else {
    parts.push(unit(m, 'minute'));
  }
  return parts.join(' ');
}

/** Shown when a creation is paused for now — chat is never affected. */
function cooldownMessage(locale: Locale, action: string, seconds: number): string {
  const label = ACTION_LABEL[locale][action] ?? action;
  const wait = formatWait(seconds, locale);
  if (locale === 'ar') return `يرجى الانتظار ${wait} قبل الإنشاء مرة أخرى (${label}). الدردشة متاحة دائمًا.`;
  if (locale === 'ur') return `${label} دوبارہ بنانے کے لیے ${wait} انتظار کریں۔ چیٹ ہمیشہ دستیاب ہے۔`;
  return `Please wait ${wait} before creating another ${label}. Chat is still available.`;
}

/** Shown when the period's allowance is used up. Only free users are pointed at Premium. */
function quotaMessage(locale: Locale, action: string, planCode?: string): string {
  const label = ACTION_LABEL[locale][action] ?? action;
  const upgrade = planCode === 'free';
  if (locale === 'ar') {
    return `لقد وصلت إلى حد (${label}) لهذه الفترة.${upgrade ? ' قم بالترقية إلى بريميم للوصول الكامل.' : ''}`;
  }
  if (locale === 'ur') {
    return `اس مدت کے لیے آپ کی ${label} کی حد پوری ہو چکی ہے۔${upgrade ? ' مکمل رسائی کے لیے پریمیم حاصل کریں۔' : ''}`;
  }
  return `You've reached your ${label} limit for this period.${upgrade ? ' Get Premium for full access.' : ''}`;
}

/**
 * The primary entry point: one box, any request, any of the three languages.
 *
 * The user never picks a mode. What comes back — an answer, a question, or a
 * running project — is the Core's decision, not a setting.
 *
 * Exchanges accumulate in a running thread rather than replacing one another,
 * so an earlier question and answer stay visible while a new one is asked —
 * the ordinary expectation for a chat surface. The input bar itself is fixed
 * to the bottom of the viewport, not the bottom of the page content, so it
 * cannot drift or resize as the thread above it grows.
 */
export function CreateConsole({
  locale,
  withHistory = false,
  builder,
  conversationId: initialConversationId,
  initialThread = [],
}: {
  locale: Locale;
  /** Set on the Websites and Games pages: every request there makes a file. */
  builder?: 'website' | 'game';
  /** Chats are saved and listed. Off for Create, whose requests are not conversations. */
  withHistory?: boolean;
  /** The saved chat being resumed, when there is one. */
  conversationId?: string;
  /** Its messages, loaded on the server so the page opens already filled. */
  initialThread?: ThreadEntry[];
}) {
  const t = useTranslations('create');
  const tError = useTranslations('error');
  const router = useRouter();
  const historyText = HISTORY_TEXT[locale];

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [thread, setThread] = useState<ThreadEntry[]>(initialThread);
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [builderDrawerOpen, setBuilderDrawerOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [job, setJob] = useState<{ jobId: string; plan: PlanView } | null>(null);
  const [error, setError] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  // Holds the in-flight request so the stop button can cancel it, and the
  // active speech session so toggling voice input twice doesn't leak one —
  // both are refs, not state, because starting or stopping them should never
  // itself trigger a re-render.
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread, question, job]);

  /** Cancels the in-flight request. Whatever text has streamed in stays in the thread. */
  function stop() {
    abortRef.current?.abort();
  }

  /** Starts a fresh, empty chat in place, with no page load, so it is instant. */
  function newChat() {
    stop();
    setThread([]);
    setInput('');
    setQuestion('');
    setJob(null);
    setError('');
    setConversationId(undefined);
    setDrawerOpen(false);
    window.history.replaceState(null, '', `/${locale}/chat`);
  }

  function openChat(id: string) {
    setDrawerOpen(false);
    if (id === conversationId) return;
    stop();
    router.push(`/${locale}/chat/${id}`);
  }

  /**
   * The saved chat this message belongs to, created on first use. If saving is
   * not possible the chat still works; it just is not kept.
   */
  async function ensureConversation(firstMessage: string, signal: AbortSignal) {
    if (!withHistory) return undefined;
    if (conversationId) return conversationId;

    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: firstMessage.replace(/\s+/g, ' ').slice(0, 60), locale }),
      signal,
    });
    if (!res.ok) return undefined;

    const { id } = (await res.json()) as { id: string };
    setConversationId(id);
    window.history.replaceState(null, '', `/${locale}/chat/${id}`);
    return id;
  }

  /** Speech-to-text for the input box. Silently does nothing where the browser lacks support. */
  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    type SpeechWindow = Window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const w = window as SpeechWindow;
    const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = RECOGNITION_LANG[locale];
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
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
        body: JSON.stringify({ request: message, locale, ...(builder ? { builder } : {}) }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = (await res.json()) as {
          code?: string;
          action?: string;
          retryAfterSeconds?: number;
          planCode?: string;
        };
        setError(
          body.code === 'COOLDOWN' && body.action && body.retryAfterSeconds
            ? cooldownMessage(locale, body.action, body.retryAfterSeconds)
          : body.code === 'QUOTA_EXCEEDED' && body.action
            ? quotaMessage(locale, body.action, body.planCode)
          : body.code === 'RATE_LIMITED' ? tError('rateLimited')
          : body.code === 'NOT_CONFIGURED' ? tError('notConfigured')
          : body.code === 'UNAUTHORIZED' ? tError('unauthorized')
          : tError('generic'),
        );
        return;
      }

      const data = await res.json();

      if (data.kind === 'project') {
        setJob({ jobId: data.jobId, plan: data.plan });
        if (builder) {
          // A builder page's own submission always makes a project; the drawer
          // is opened to it so finishing is seen, not just assumed.
          setBuilderDrawerOpen(true);
        }
        return;
      }

      // Simple request: stream the answer instead of creating a project.
      const savedId = await ensureConversation(message, controller.signal);
      await streamAnswer(message, controller.signal, savedId);
    } catch (err) {
      // A user-initiated stop throws AbortError; that is success, not failure.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(tError('generic'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function streamAnswer(message: string, signal: AbortSignal, savedId?: string) {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, locale, conversationId: savedId }),
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
        const parsed = JSON.parse(payload) as {
          delta?: string;
          error?: { message: string };
          image?: string;
        };
        if (parsed.error) setError(parsed.error.message);
        if (parsed.image) {
          setThread((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') next[next.length - 1] = { ...last, image: parsed.image };
            return next;
          });
        }
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
    <div className="max-w-3xl mx-auto p-6 md:p-10 pb-40">
      {withHistory && (
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={historyText.chats}
            className="w-9 h-9 rounded-full flex items-center justify-center text-ink-muted hover:bg-parchment-raised transition-colors"
          >
            <PanelLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={newChat}
            aria-label={historyText.newChat}
            className="w-9 h-9 rounded-full flex items-center justify-center text-ink-muted hover:bg-parchment-raised transition-colors"
          >
            <SquarePen className="w-5 h-5" />
          </button>
        </div>
      )}

      {builder && (
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={() => setBuilderDrawerOpen(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-ink-muted hover:bg-parchment-raised transition-colors"
          >
            <PanelLeft className="w-5 h-5" />
          </button>
        </div>
      )}

      <h1 className="text-2xl md:text-3xl font-bold mb-6">{t('heading')}</h1>

      <div className="space-y-4">
        {thread.map((entry, i) => (
          <div
            key={i}
            className={`y-card p-4 max-w-[85%] whitespace-pre-wrap ${
              entry.role === 'user' ? 'ms-auto bg-amber-deep/20 border-amber-deep/40' : ''
            }`}
          >
            {entry.content}
            {entry.image && (
              // eslint-disable-next-line @next/next/no-img-element -- a remote
              // course image, not a local asset Next's optimizer can process
              <img src={entry.image} alt="" className="mt-3 rounded-lg max-w-full" />
            )}
          </div>
        ))}

        {question && <p className="y-card p-5">{question}</p>}
        {job && <JobProgress jobId={job.jobId} steps={job.plan.steps} locale={locale} />}
        {error && <p className="text-danger text-sm">{error}</p>}

        <div ref={bottomRef} />
      </div>

      {/* Fixed to the viewport, not the page: this bar cannot drift or
          resize as the thread above it grows, unlike a bar positioned
          relative to page content. */}
      <div className="fixed bottom-0 inset-x-0 border-t border-edge bg-parchment/95 backdrop-blur">
        <div className="max-w-3xl mx-auto p-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
            }}
            placeholder={t('placeholder')}
            rows={2}
            className="w-full resize-none bg-transparent outline-none placeholder:text-ink-muted/60"
          />
          <div className="flex justify-between items-center pt-3 border-t border-edge">
            <div className="flex gap-1">
              <button
                type="button"
                disabled
                title="File attachments need cloud storage configured first"
                aria-label="Attach file"
                className="w-9 h-9 rounded-full flex items-center justify-center text-ink-muted opacity-40 cursor-not-allowed"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={toggleVoice}
                aria-label="Voice input"
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                  listening ? 'bg-danger/20 text-danger' : 'text-ink-muted hover:bg-parchment-raised'
                }`}
              >
                <Mic className="w-5 h-5" />
              </button>
            </div>

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

      {builder && (
        <BuilderHistoryDrawer
          locale={locale}
          builder={builder}
          open={builderDrawerOpen}
          onClose={() => setBuilderDrawerOpen(false)}
        />
      )}

      {withHistory && (
        <ChatHistoryDrawer
          locale={locale}
          open={drawerOpen}
          activeId={conversationId}
          onClose={() => setDrawerOpen(false)}
          onNewChat={newChat}
          onOpenChat={openChat}
          onDeleted={(id) => {
            if (id === conversationId) newChat();
          }}
        />
      )}
    </div>
  );
}
