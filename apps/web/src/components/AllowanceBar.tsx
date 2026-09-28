'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Locale } from '@yarub/shared';

/**
 * The plan badge, and an upgrade link for free accounts.
 *
 * Deliberately no counts. What a plan allows is not advertised anywhere in
 * the interface; a user learns they have reached a limit when they do, from
 * the message the server returns. The limits themselves are still enforced
 * server-side on every request — hiding them here changes nothing about that.
 */
export function AllowanceBar({ locale }: { locale: Locale }) {
  const tPlan = useTranslations('plan');
  const [planCode, setPlanCode] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/entitlements');
      if (res.ok) setPlanCode(((await res.json()) as { planCode: string }).planCode);
    })();
  }, []);

  if (!planCode) return null;

  return (
    <div className="y-card p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {tPlan(planCode as 'free')}
      </span>

      {planCode === 'free' && (
        <Link href={`/${locale}/pricing`} className="ms-auto text-sm font-semibold underline hover:text-amber-deep">
          {tPlan('upgrade')}
        </Link>
      )}
    </div>
  );
}
