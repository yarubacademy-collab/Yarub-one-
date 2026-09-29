'use client';

import { useEffect, useState } from 'react';
import { Download, Trash2, X } from 'lucide-react';
import type { Locale } from '@yarub/shared';

interface BuiltRow {
  id: string;
  title: string;
  createdAt: string;
  status: string | null;
  versionId: string | null;
}

export const BUILDER_HISTORY_TEXT: Record<
  Locale,
  {
    heading: (builder: 'website' | 'game') => string;
    empty: string;
    remove: string;
    sure: string;
    close: string;
    inProgress: string;
    failed: string;
  }
> = {
  en: {
    heading: (b) => (b === 'website' ? 'Your websites' : 'Your games'),
    empty: 'Nothing made yet',
    remove: 'Delete',
    sure: 'Tap again to delete',
    close: 'Close',
    inProgress: 'Still building…',
    failed: 'Did not finish',
  },
  ar: {
    heading: (b) => (b === 'website' ? 'مواقعك' : 'ألعابك'),
    empty: 'لم يتم إنشاء شيء بعد',
    remove: 'حذف',
    sure: 'اضغط مرة أخرى للحذف',
    close: 'إغلاق',
    inProgress: 'قيد الإنشاء…',
    failed: 'لم تكتمل',
  },
  ur: {
    heading: (b) => (b === 'website' ? 'آپ کی ویب سائٹس' : 'آپ کے گیمز'),
    empty: 'ابھی کچھ نہیں بنا',
    remove: 'حذف کریں',
    sure: 'حذف کے لیے دوبارہ دبائیں',
    close: 'بند کریں',
    inProgress: 'ابھی بن رہا ہے…',
    failed: 'مکمل نہیں ہوا',
  },
};

/**
 * Past generations for a builder page (Websites or Games): a list to download
 * or delete, not to reopen and continue — each submission already made its own
 * finished file, so there is nothing to resume the way a chat resumes.
 */
export function BuilderHistoryDrawer({
  locale,
  builder,
  open,
  onClose,
}: {
  locale: Locale;
  builder: 'website' | 'game';
  open: boolean;
  onClose: () => void;
}) {
  const text = BUILDER_HISTORY_TEXT[locale];
  const [rows, setRows] = useState<BuiltRow[] | null>(null);
  const [confirming, setConfirming] = useState('');

  useEffect(() => {
    if (!open) return;
    setConfirming('');
    let cancelled = false;

    void (async () => {
      const res = await fetch(`/api/projects?domain=${builder}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { projects: BuiltRow[] };
      setRows(data.projects);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, builder]);

  async function remove(id: string) {
    if (confirming !== id) {
      setConfirming(id);
      return;
    }

    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (!res.ok) return;

    setRows((prev) => (prev ? prev.filter((row) => row.id !== id) : prev));
    setConfirming('');
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <aside className="absolute inset-y-0 start-0 w-72 max-w-[85%] bg-parchment-raised border-e border-edge flex flex-col">
        <div className="flex items-center justify-between p-4">
          <h2 className="font-semibold">{text.heading(builder)}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={text.close}
            className="w-9 h-9 rounded-full flex items-center justify-center text-ink-muted hover:bg-parchment-sunk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {rows && rows.length === 0 && (
            <p className="px-3 py-2 text-sm text-ink-muted">{text.empty}</p>
          )}

          <ul className="space-y-1">
            {(rows ?? []).map((row) => {
              const done = row.status === 'succeeded' && row.versionId;
              const failed = row.status === 'failed' || row.status === 'cancelled';

              return (
                <li key={row.id} className="flex items-center gap-1 rounded-lg">
                  {done ? (
                    <a
                      href={`/api/artifacts/${row.versionId}/export`}
                      dir="auto"
                      className="flex-1 min-w-0 flex items-center gap-2 truncate px-3 py-2.5 text-sm rounded-lg hover:bg-parchment-sunk"
                    >
                      <Download className="w-4 h-4 shrink-0 text-amber" />
                      <span className="truncate">{row.title}</span>
                    </a>
                  ) : (
                    <span
                      dir="auto"
                      className="flex-1 min-w-0 truncate px-3 py-2.5 text-sm text-ink-muted"
                    >
                      {row.title}
                      {' — '}
                      {failed ? text.failed : text.inProgress}
                    </span>
                  )}

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
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
