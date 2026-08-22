import type { Capability, Locale } from '@yarub/shared';
import { CAPABILITIES } from '@yarub/shared';
import { loadConfig } from '@yarub/config';
import { buildRegistryWithOverrides } from '@yarub/providers';
import { ImageStudio } from '../../../components/ImageStudio';
import { NotConfigured } from '../../../components/NotConfigured';

const CAPABILITY: Capability = 'image.generate';

export default async function ImageSectionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const report = await (await buildRegistryWithOverrides(loadConfig())).report(CAPABILITIES);
  const status = report.find((r) => r.capability === CAPABILITY)?.status;

  if (status === 'not_configured') return <NotConfigured capability={CAPABILITY} />;
  return <ImageStudio locale={locale as Locale} />;
}
