import { getTranslations } from 'next-intl/server';
import { PricingTable } from '../../../components/PricingTable';

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('plan');

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-10">
      <h1 className="text-2xl font-bold mb-6">{t('upgrade')}</h1>
      <PricingTable locale={locale} />
    </div>
  );
}
