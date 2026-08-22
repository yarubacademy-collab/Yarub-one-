import type { Capability, Locale } from '@yarub/shared';
import { CAPABILITIES } from '@yarub/shared';
import { loadConfig } from '@yarub/config';
import { buildRegistryWithOverrides } from '@yarub/providers';
import { VideoStudio } from '../../../components/VideoStudio';
import { NotConfigured } from '../../../components/NotConfigured';

const CAPABILITY: Capability = 'video.textToVideo';

export default async function VideoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const registry = await buildRegistryWithOverrides(loadConfig());
  const report = await registry.report(CAPABILITIES);
  const status = report.find((r) => r.capability === CAPABILITY)?.status;

  if (status === 'not_configured') return <NotConfigured capability={CAPABILITY} />;
  return <VideoStudio locale={locale as Locale} />;
}
