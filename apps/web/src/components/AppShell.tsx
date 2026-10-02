'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { type Locale } from '@yarub/shared';

// Chat and the account page (the only reachable path to sign in / sign up —
// without a rail entry there is no way to reach it, not from the site and
// not from the Android app, which has no address bar to type one in).
// Image, video, website, game and the rest of the capability pages, the plan
// badge and the Premium link are intentionally gone: this build is chat-only,
// with no paid tier of any kind.
const SECTIONS = ['chat', 'account'] as const;

/**
 * One shell for the whole product.
 *
 * Every capability lives inside the same frame so YARUB ONE reads as a single
 * workspace rather than a set of separate tools sharing a logo. The rail sits
 * on the inline-start edge, which mirrors automatically in Arabic and Urdu.
 */
export function AppShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex">
      <nav
        aria-label={t('brand.name')}
        className="hidden md:flex w-60 shrink-0 flex-col gap-1 border-e border-edge bg-parchment-sunk p-4"
      >
        <div className="mb-6 px-2">
          <div className="text-lg font-bold tracking-tight">{t('brand.name')}</div>
          <div className="text-xs text-ink-muted">{t('brand.tagline')}</div>
        </div>

        {SECTIONS.map((section) => {
          const href = `/${locale}/${section}`;
          return (
            <Link
              key={section}
              href={href}
              className="y-rail-item"
              aria-current={pathname === href ? 'page' : undefined}
            >
              {t(`nav.${section}`)}
            </Link>
          );
        })}
      </nav>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
