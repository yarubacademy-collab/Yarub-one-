'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Locale } from '@yarub/shared';

interface Allowance {
  action: 'image' | 'video' | 'website' | 'game' | 'document';
  used: number;
  limit: number;
  remaining: number;
}

interface EntitlementResponse {
  planCode: string;
  allowance: Allowance[];
  maxVideoSeconds: number;
}

/**
 * Remaining allowance, read from the server.
 *
 * These numbers are display only. Enforcement happens again on every request,
 * so a user who edits them in the browser changes nothing but their own view.
 */
export function AllowanceBar({ locale }: { locale: Locale }) {
  const t = useTranslations('meter');
  const tPlan = useTranslations('plan');
  const [data, setData] = useState<EntitlementResponse | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/entitlements');
      if (res.ok) setData((await res.json()) as EntitlementResponse);
    })();
  }, []);

  if (!data) return null;

  const creation = data.allowance.filter((a) => a.action !== 'document');

  return (
    <div className="y-card p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {tPlan(data.planCode as 'free')}
      </span>

      {creation.map((row) => (
        <span key={row.action} className="text-sm flex items-center gap-2">
          <span className="text-ink-muted">{t(row.action)}</span>
          <span className={`numeral font-semibold ${row.remaining === 0 ? 'text-danger' : ''}`}>
            {row.remaining} / {row.limit}
          </span>
        </span>
      ))}

      {data.planCode === 'free' && (
        <Link href={`/${locale}/pricing`} className="ms-auto text-sm font-semibold underline hover:text-amber-deep">
          {tPlan('upgrade')}
        </Link>
      )}
    </div>
  );
}
