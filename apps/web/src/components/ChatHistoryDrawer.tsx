'use client';

import { useEffect, useState } from 'react';
import { SquarePen, Trash2, X } from 'lucide-react';
import type { Locale } from '@yarub/shared';

interface ChatRow {
  id: string;
  title: string;
}

/**
 * Wording for the history feature, kept beside the component that uses it.
 * (Not in the message files: a key missing from one language there breaks the
 * whole page for that language, and this is the only place these are used.)
 */
export const HISTORY_TEXT: Record<
  Locale,
  { chats: string; newChat: string; empty: string; remove: string; sure: string; close: string }
> = {
  en: {
    chats: 'Chats',
    newChat: 'New chat',
    empty: 'No chats yet',
    remove: 'Delete',
    sure: 'Tap again to delete',
    close: 'Close',
  },
  ar: {
    chats: 'المحادثات',
    newChat: 'محادثة جديدة',
    empty: 'لا توجد محادثات بعد',
    remove: 'حذف',
    sure: 'اضغط مرة أخرى للحذف',
    close: 'إغلاق',
  },
  ur: {
    chats: 'چیٹس',
    newChat: 'نئی چیٹ',
    empty: 'ابھی کوئی چیٹ نہیں',
    remove: 'حذف کریں',
    sure: 'حذف کے لیے دوبارہ دبائیں',
    close: 'بند کریں',
  },
};

/**
 * Past chats: open one, delete one, or start a new one.
 *
 * The list is read from the server each time the drawer opens, so it is always
 * current and costs nothing on a page that never opens it. Deleting needs a
 * second tap rather than a browser confirm dialog, because the Android app's
 * WebView does not show those.
 */
export function ChatHistoryDrawer({
  locale,
  open,
  activeId,
  onClose,
  onNewChat,
  onOpenChat,
  onDeleted,
}: {
  locale: Locale;
  open: boolean;
  activeId?: string;
  onClose: () => void;
  onNewChat: () => void;
  onOpenChat: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const text = HISTORY_TEXT[locale];
  const [rows, setRows] = useState<ChatRow[] | null>(null);
  const [confirming, setConfirming] = useState('');

  useEffect(() => {
    if (!open) return;
    setConfirming('');
    let cancelled = false;

    void (async () => {
      const res = await fetch('/api/conversations?nonEmpty=1');
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { conversations: ChatRow[] };
      setRows(data.conversations);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function remove(id: string) {
    if (confirming !== id) {
      setConfirming(id);
      return;
    }

    const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    if (!res.ok) return;

    setRows((prev) => (prev ? prev.filter((row) => row.id !== id) : prev));
    setConfirming('');
    onDeleted(id);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <aside className="absolute inset-y-0 start-0 w-72 max-w-[85%] bg-parchment-raised border-e border-edge flex flex-col">
        <div className="flex items-center justify-between p-4">
          <h2 className="font-semibold">{text.chats}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={text.close}
            className="w-9 h-9 rounded-full flex items-center justify-center text-ink-muted hover:bg-parchment-sunk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-edge py-2.5 text-sm font-medium hover:bg-parchment-sunk transition-colors"
          >
            <SquarePen className="w-4 h-4" />
            {text.newChat}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {rows && rows.length === 0 && (
            <p className="px-3 py-2 text-sm text-ink-muted">{text.empty}</p>
          )}

          <ul className="space-y-1">
            {(rows ?? []).map((row) => (
              <li
                key={row.id}
                className={`flex items-center gap-1 rounded-lg ${
                  row.id === activeId ? 'bg-parchment-sunk' : ''
                }`}
              >
                <button
                  type="button"
                  dir="auto"
                  onClick={() => onOpenChat(row.id)}
                  className="flex-1 min-w-0 truncate text-start px-3 py-2.5 text-sm rounded-lg hover:bg-parchment-sunk"
                >
                  {row.title}
                </button>

                <button
                  type="button"
                  onClick={() => void remove(row.id)}
                  aria-label={text.remove}
                  className={`shrink-0 h-9 rounded-lg px-2 text-xs transition-colors ${
                    confirming === row.id
                      ? 'bg-danger/20 text-danger'
                      : 'text-ink-muted hover:text-danger'
                  }`}
                >
                  {confirming === row.id ? text.sure : <Trash2 className="w-4 h-4" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
