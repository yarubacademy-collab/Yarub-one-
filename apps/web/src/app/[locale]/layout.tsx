import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LOCALES, dirFor, type Locale } from '@yarub/shared';
import { AppShell } from '../../components/AppShell';
import '../../styles/globals.css';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(LOCALES as readonly string[]).includes(locale)) notFound();

  const typed = locale as Locale;
  const messages = await getMessages();

  return (
    <html lang={typed} dir={dirFor(typed)}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <AppShell locale={typed}>{children}</AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
