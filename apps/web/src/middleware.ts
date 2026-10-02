import createMiddleware from 'next-intl/middleware';
import { LOCALES } from '@yarub/shared';

/**
 * Arabic is the default locale: this is an Arabic-first product, and the other
 * two languages are equals rather than the baseline.
 *
 * localeDetection is off on purpose. Left on, next-intl picks a first-time
 * visitor's locale from the device's own language setting (the Android
 * client's WebView, in particular, very often reports "en" regardless of
 * what language the person actually uses), which silently overrode
 * defaultLocale for most visitors. With it off, a first visit always lands on
 * Arabic; a person who then switches language explicitly is still remembered
 * on their next visit, via next-intl's own locale cookie.
 */
export default createMiddleware({
  locales: [...LOCALES],
  defaultLocale: 'ar',
  localePrefix: 'always',
  localeDetection: false,
});

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};

