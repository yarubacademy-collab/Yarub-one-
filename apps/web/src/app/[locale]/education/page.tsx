import type { Capability } from '@yarub/shared';
import { CAPABILITIES } from '@yarub/shared';
import { loadConfig } from '@yarub/config';
import { buildRegistryWithOverrides } from '@yarub/providers';
import type { Locale } from '@yarub/shared';
import { CreateConsole } from '../../../components/CreateConsole';
import { NotConfigured } from '../../../components/NotConfigured';

const CAPABILITY: Capability = 'text.reason';

/**
 * A capability section is a shortcut into the same console, gated on whether
 * the capability is actually usable. If it is not, the user is told plainly
 * rather than shown an interface that cannot deliver.
 */
export default async function SectionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const report = await (await buildRegistryWithOverrides(loadConfig())).report(CAPABILITIES);
  const status = report.find((r) => r.capability === CAPABILITY)?.status;

  if (status === 'not_configured') return <NotConfigured capability={CAPABILITY} />;
  return <CreateConsole locale={locale as Locale} />;
}
