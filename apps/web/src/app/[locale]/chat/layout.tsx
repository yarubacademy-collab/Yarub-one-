import type { ReactNode } from 'react';
import type { Locale } from '@yarub/shared';
import { ConversationSidebar } from '../../../components/ConversationSidebar';

export default async function ChatLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <div className="flex h-full min-h-screen">
      <ConversationSidebar locale={locale as Locale} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
