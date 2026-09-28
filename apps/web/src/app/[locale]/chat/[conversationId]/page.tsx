import { notFound } from 'next/navigation';
import { prisma } from '@yarub/db';
import type { Locale } from '@yarub/shared';
import { currentUserId } from '../../../../lib/session';
import { CreateConsole } from '../../../../components/CreateConsole';

/**
 * A saved chat, reopened.
 *
 * Its messages are loaded here, on the server, so the page arrives already
 * filled rather than blank and then populated. Ownership is part of the query:
 * someone else's chat id finds nothing.
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ locale: string; conversationId: string }>;
}) {
  const { locale, conversationId } = await params;

  const userId = await currentUserId();
  if (!userId) notFound();

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, project: { userId } },
    select: {
      messages: {
        where: { role: { in: ['user', 'assistant'] } },
        orderBy: { createdAt: 'asc' },
        take: 500,
        select: { role: true, content: true },
      },
    },
  });
  if (!conversation) notFound();

  const initialThread = conversation.messages.map((message) => ({
    role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: message.content,
  }));

  return (
    <CreateConsole
      // A different chat is a different component: without the key React would
      // keep the old one's state when moving from one chat to the next.
      key={conversationId}
      locale={locale as Locale}
      withHistory
      conversationId={conversationId}
      initialThread={initialThread}
    />
  );
}
