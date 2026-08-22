import { notFound } from 'next/navigation';
import { prisma } from '@yarub/db';
import type { Locale } from '@yarub/shared';
import { currentUserId } from '../../../../lib/session';
import { ConversationView } from '../../../../components/ConversationView';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ locale: string; conversationId: string }>;
}) {
  const { locale, conversationId } = await params;

  const userId = await currentUserId();
  if (!userId) notFound();

  const owned = await prisma.conversation.findFirst({
    where: { id: conversationId, project: { userId } },
    select: { id: true },
  });
  if (!owned) notFound();

  return <ConversationView locale={locale as Locale} conversationId={conversationId} />;
}
