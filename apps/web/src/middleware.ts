import createMiddleware from 'next-intl/middleware';
import { LOCALES } from '@yarub/shared';

/**
 * Arabic is the default locale: this is an Arabic-first product, and the other
 * two languages are equals rather than the baseline.
 */
export default createMiddleware({
  locales: [...LOCALES],
  defaultLocale: 'ar',
  localePrefix: 'always',
});

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
