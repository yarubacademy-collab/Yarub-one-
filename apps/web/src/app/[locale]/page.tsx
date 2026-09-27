import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { MessageSquare, Image as ImageIcon, Video, Globe, Gamepad2, Sparkles } from 'lucide-react';
import type { Locale } from '@yarub/shared';

const CHOICES = [
  { key: 'create', icon: Sparkles },
  { key: 'chat', icon: MessageSquare },
  { key: 'image', icon: ImageIcon },
  { key: 'video', icon: Video },
  { key: 'website', icon: Globe },
  { key: 'game', icon: Gamepad2 },
] as const;

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

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {CHOICES.map(({ key, icon: Icon }) => (
            <Link
              key={key}
              href={`/${typedLocale}/${key}`}
              className="y-card p-6 flex flex-col items-center gap-3 hover:border-amber transition-colors"
            >
              <Icon className="w-8 h-8 text-amber" />
              <span className="text-lg font-medium">{t(`nav.${key}`)}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
