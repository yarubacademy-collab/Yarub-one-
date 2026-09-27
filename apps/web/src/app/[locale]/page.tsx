import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MessageSquare, Image as ImageIcon, Video, Globe, Gamepad2, Sparkles } from 'lucide-react';
import type { Locale } from '@yarub/shared';
import { currentUserId } from '../../lib/session';

export const dynamic = 'force-dynamic';

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
 * direct door into one capability. But a signed-out visitor sees the sign-in
 * page first, not the choice screen — this is the app's only entry point
 * (the Android client has no address bar), so this is the sole place that
 * gate can live.
 */
export default async function LocaleRoot({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale = locale as Locale;

  const userId = await currentUserId();
  if (!userId) {
    redirect(`/${typedLocale}/login`);
  }

  const t = await getTranslations();

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
