import { getTranslations } from 'next-intl/server';
import { CAPABILITIES } from '@yarub/shared';
import { loadConfig } from '@yarub/config';
import { buildRegistryWithOverrides } from '@yarub/providers';
import { ProviderSettings } from '../../../components/ProviderSettings';
import { UsagePanel } from '../../../components/UsagePanel';

const BADGE: Record<string, string> = {
  available: 'bg-ink text-parchment',
  degraded: 'bg-amber text-ink',
  not_configured: 'bg-parchment-sunk text-ink-muted border border-edge',
};

/**
 * The capability matrix plus the credential form.
 *
 * The matrix is the honest view of what this installation can do; the form is
 * how that changes. Neither ever renders a decrypted key.
 */
export default async function SettingsPage() {
  const t = await getTranslations('capability');
  const registry = await buildRegistryWithOverrides(loadConfig());
  const report = await registry.report(CAPABILITIES);

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10 space-y-10">
      <section>
        <h1 className="text-2xl font-bold mb-6">{t('heading')}</h1>
        <ul className="y-card divide-y divide-edge">
          {report.map((row) => (
            <li key={row.capability} className="flex items-center justify-between gap-4 p-4">
              <span>{t(row.capability)}</span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${BADGE[row.status]}`}>
                {t(row.status)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-muted mt-4">{t('notConfiguredHelp')}</p>
      </section>

      <ProviderSettings />

      <UsagePanel />
    </div>
  );
}
