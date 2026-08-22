'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Capability } from '@yarub/shared';

interface UsageResponse {
  creditsEnabled: boolean;
  balance: { granted: number; spent: number; remaining: number; expired: number };
  breakdown: Array<{ capability: Capability; credits: number; units: number }>;
}

/**
 * What has actually been consumed.
 *
 * When credits are disabled — the default for a self-hosted install — this
 * shows spend only and says nothing about a balance, because there is no
 * billing relationship to report on.
 */
export function UsagePanel() {
  const t = useTranslations('capability');
  const [data, setData] = useState<UsageResponse | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/usage');
      if (res.ok) setData((await res.json()) as UsageResponse);
    })();
  }, []);

  if (!data) return null;

  return (
    <section>
      <h2 className="text-lg font-bold mb-4">{t('heading')}</h2>

      {data.creditsEnabled && (
        <div className="y-card p-5 mb-4 flex items-baseline justify-between gap-4">
          <span className="text-sm text-ink-muted">{data.balance.spent}</span>
          <span
            className={`numeral text-2xl font-bold ${
              data.balance.remaining < 0 ? 'text-danger' : ''
            }`}
          >
            {data.balance.remaining}
          </span>
        </div>
      )}

      {data.breakdown.length === 0 ? (
        <p className="text-sm text-ink-muted">—</p>
      ) : (
        <ul className="y-card divide-y divide-edge">
          {data.breakdown.map((row) => (
            <li key={row.capability} className="flex items-center justify-between gap-4 p-4">
              <span className="text-sm">{t(row.capability)}</span>
              <span className="numeral text-sm text-ink-muted">
                {row.units} · {row.credits}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
