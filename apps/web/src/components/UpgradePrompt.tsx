'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Locale } from '@yarub/shared';

export interface QuotaError {
  action: string;
  used: number;
  limit: number;
  planCode: string;
}

/**
 * What a user sees at their limit.
 *
 * A quota is a product boundary, not a failure, so this replaces the generic
 * error path entirely: it names what ran out, shows the count, and offers the
 * one action that resolves it.
 */
export function UpgradePrompt({ locale, error }: { locale: Locale; error: QuotaError }) {
  const t = useTranslations('plan');
  const tMeter = useTranslations('meter');

  return (
    <div className="y-card p-6 text-center border-amber/40">
      <p className="font-semibold mb-2">{t('limitReached')}</p>

      <p className="text-sm text-ink-muted mb-5">
        {tMeter(error.action as 'image')}{' '}
        <span className="numeral">
          {error.used} / {error.limit}
        </span>
      </p>

      <Link href={`/${locale}/pricing`} className="y-primary inline-block">
        {t('upgrade')}
      </Link>
    </div>
  );
}
