'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { type Locale, isRtl } from '@yarub/shared';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

/**
 * A conversation that persists.
 *
 * The console handles one-shot requests; this handles a thread. History is
 * loaded from the server rather than held in component state, so closing the
 * app and returning later resumes exactly where the user left off — which is
 * the whole point of attaching conversations to projects.
 */
export function ConversationView({
  locale,
  conversationId,
}: {
  locale: Locale;
  conversationId: string;
}) {
  const t = useTranslations('create');
  const tError = useTranslations('error');

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/conversations/${conversationId}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { messages: Message[] };
      setMessages(data.messages);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    setBusy(true);
    setError('');
    setInput('');
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', content: text }]);

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, locale, conversationId }),
      });

      const contentType = res.headers.get('content-type') ?? '';

      if (!contentType.includes('event-stream')) {
        const data = (await res.json()) as { kind?: string; question?: string; code?: string };
        if (data.kind === 'clarify' && data.question) {
          setMessages((prev) => [
            ...prev,
            { id: `local-q-${Date.now()}`, role: 'assistant', content: data.question! },
          ]);
        } else {
          setError(data.code === 'NOT_CONFIGURED' ? tError('notConfigured') : tError('generic'));
        }
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          const parsed = JSON.parse(payload) as { delta?: string; error?: { message: string } };
          if (parsed.error) setError(parsed.error.message);
          if (parsed.delta) {
            full += parsed.delta;
            setStreaming(full);
          }
        }
      }

      if (full) {
        setMessages((prev) => [...prev, { id: `local-a-${Date.now()}`, role: 'assistant', content: full }]);
      }
    } catch {
      setError(tError('generic'));
    } finally {
      setStreaming('');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message) => (
          <Bubble key={message.id} role={message.role} content={message.content} locale={locale} />
        ))}
        {streaming && <Bubble role="assistant" content={streaming} locale={locale} />}
        {error && <p className="text-danger text-sm">{error}</p>}
        <div ref={endRef} />
      </div>

      <div className="border-t border-edge p-4">
        <div className="y-card p-3 flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={t('placeholder')}
            rows={2}
            className="flex-1 resize-none bg-transparent outline-none placeholder:text-ink-muted/60"
          />
          <button onClick={() => void send()} disabled={busy || !input.trim()} className="y-primary">
            {busy ? t('thinking') : t('submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({
  role,
  content,
  locale,
}: {
  role: 'user' | 'assistant';
  content: string;
  locale: Locale;
}) {
  const mine = role === 'user';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        dir={isRtl(locale) ? 'rtl' : 'ltr'}
        className={`max-w-[85%] rounded-card px-4 py-3 whitespace-pre-wrap ${
          mine ? 'bg-ink text-parchment' : 'y-card'
        }`}
      >
        {content}
      </div>
    </div>
  );
}
