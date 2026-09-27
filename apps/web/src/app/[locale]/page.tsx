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
 * The first screen anyone sees: six tiles filling the full viewport, each a
 * direct door into one capability. Previously this route redirected straight
 * into /create, so there was no moment to choose — every session began in
 * the same text box regardless of intent. The tiles are edge to edge, like an
 * app launcher, rather than a card grid floating over visible background —
 * the choice itself is the whole screen.
 */
export default async function LocaleRoot({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations();
  const typedLocale = locale as Locale;

  return (
    <div className="grid grid-cols-2 grid-rows-3 h-screen">
      {CHOICES.map(({ key, icon: Icon }) => (
        <Link
          key={key}
          href={`/${typedLocale}/${key}`}
          className="flex flex-col items-center justify-center gap-3 border border-edge hover:bg-parchment-raised transition-colors"
        >
          <Icon className="w-10 h-10 text-amber" />
          <span className="text-lg font-medium">{t(`nav.${key}`)}</span>
        </Link>
      ))}
    </div>
  );
}
