import { getRequestConfig } from 'next-intl/server';
import { LOCALES, type Locale } from '@yarub/shared';

export default getRequestConfig(async ({ locale }) => {
  const active = (LOCALES as readonly string[]).includes(locale ?? '')
    ? (locale as Locale)
    : 'ar';
  return { messages: (await import(`../../messages/${active}.json`)).default };
});
