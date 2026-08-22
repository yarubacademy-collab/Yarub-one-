'use client';

import { useTranslations } from 'next-intl';
import type { Capability } from '@yarub/shared';

/**
 * The honest empty state.
 *
 * When a capability has no provider, the user sees exactly this and nothing
 * that imitates a working feature. It names what is missing so the gap is
 * actionable rather than mysterious.
 */
export function NotConfigured({ capability }: { capability: Capability }) {
  const t = useTranslations('capability');

  return (
    <div className="y-card p-8 max-w-lg mx-auto my-16 text-center">
      <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-deep mb-3">
        <span className="y-step-dot bg-amber" aria-hidden />
        {t('not_configured')}
      </div>
      <h2 className="text-xl font-bold mb-2">{t(capability)}</h2>
      <p className="text-ink-muted text-sm">{t('notConfiguredHelp')}</p>
    </div>
  );
}
