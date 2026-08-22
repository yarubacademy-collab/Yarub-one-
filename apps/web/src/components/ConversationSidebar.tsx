'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Locale } from '@yarub/shared';

interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
}

/**
 * Conversation list.
 *
 * Threads were previously only reachable by direct link, which made the
 * persistence pointless — history you cannot find is history you do not have.
 * This is the navigation layer over the routes that already existed.
 */
export function ConversationSidebar({
  locale,
  projectId,
}: {
  locale: Locale;
  projectId?: string;
}) {
  const t = useTranslations('nav');
  const tProject = useTranslations('project');
  const pathname = usePathname();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const res = await fetch(`/api/conversations${query}`);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { conversations: ConversationSummary[] };
    setConversations(data.conversations);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function rename(id: string, currentTitle: string) {
    const title = window.prompt(tProject('rename'), currentTitle)?.trim();
    if (!title || title === currentTitle) return;

    const res = await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    if (res.ok) setConversations((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <aside className="w-64 shrink-0 border-e border-edge bg-parchment-sunk p-3 hidden lg:block overflow-y-auto">
      <h2 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {t('chat')}
      </h2>

      {loading ? (
        <div className="space-y-2 px-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 rounded-lg bg-edge/40 animate-pulse" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <p className="px-2 text-sm text-ink-muted">{tProject('empty')}</p>
      ) : (
        <ul className="space-y-1">
          {conversations.map((conversation) => {
            const href = `/${locale}/chat/${conversation.id}`;
            return (
              <li key={conversation.id} className="group flex items-center gap-1">
                <Link
                  href={href}
                  className="y-rail-item flex-1 min-w-0"
                  aria-current={pathname === href ? 'page' : undefined}
                >
                  <span className="truncate">{conversation.title}</span>
                  <span className="numeral text-xs text-ink-muted shrink-0">
                    {conversation.messageCount}
                  </span>
                </Link>
                <button
                  onClick={() => void rename(conversation.id, conversation.title)}
                  aria-label={tProject('rename')}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 px-1 text-ink-muted hover:text-ink transition-opacity"
                >
                  ✎
                </button>
                <button
                  onClick={() => void remove(conversation.id)}
                  aria-label={tProject('delete')}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 px-2 text-ink-muted hover:text-danger transition-opacity"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
