import type { Locale } from '@yarub/shared';
import { CreateConsole } from '../../../components/CreateConsole';

/**
 * Chat and Create share one console. The difference is not the interface but
 * what the Core decides to do with the request.
 */
export default async function ChatPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CreateConsole locale={locale as Locale} />;
}
