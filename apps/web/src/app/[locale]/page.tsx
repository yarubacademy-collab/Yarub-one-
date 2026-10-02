import { redirect } from 'next/navigation';
import type { Locale } from '@yarub/shared';
import { currentUserId } from '../../lib/session';

export const dynamic = 'force-dynamic';

/**
 * The app's only entry point (the Android client has no address bar).
 *
 * A signed-out visitor goes to the sign-in page first. A signed-in one goes
 * straight into Chat — the only thing this app does now, so there is nothing
 * left to choose between.
 */
export default async function LocaleRoot({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale = locale as Locale;

  const userId = await currentUserId();
  redirect(`/${typedLocale}/${userId ? 'chat' : 'login'}`);
}
