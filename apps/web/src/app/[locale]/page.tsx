import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@yarub/shared';

const CHOICES = ['chat', 'image', 'video', 'website', 'game', 'documents', 'visual', 'education'] as const;

/**
 * The first screen anyone sees: pick what to make, then land in the console
 * for it. Previously this route redirected straight into /create, so there
 * was no moment to choose — every session began in the same text box
 * regardless of intent.
 */
export default async function LocaleRoot({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations();
  const typedLocale = locale as Locale;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-2xl w-full text-center">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">{t('brand.name')}</h1>
        <p className="text-ink-muted mb-10">{t('brand.tagline')}</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CHOICES.map((choice) => (
            <Link
              key={choice}
              href={`/${typedLocale}/${choice}`}
              className="y-card p-6 hover:border-amber transition-colors text-lg font-medium"
            >
              {t(`nav.${choice}`)}
            </Link>
          ))}
        </div>

        <Link
          href={`/${typedLocale}/create`}
          className="inline-block mt-8 text-sm text-ink-muted underline underline-offset-4"
        >
          {t('nav.create')}
        </Link>
      </div>
    </div>
  );
}
