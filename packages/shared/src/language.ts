/** Arabic and Urdu are first-class working languages, not translation targets. */
export const LOCALES = ['ar', 'ur', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const RTL_LOCALES: readonly Locale[] = ['ar', 'ur'];

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function dirFor(locale: Locale): 'rtl' | 'ltr' {
  return isRtl(locale) ? 'rtl' : 'ltr';
}

/** A user-facing string that must exist in every supported language. */
export type Localized = Record<Locale, string>;
