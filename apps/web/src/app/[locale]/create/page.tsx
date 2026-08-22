import type { Locale } from '@yarub/shared';
import { CreateConsole } from '../../../components/CreateConsole';

export default async function CreatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CreateConsole locale={locale as Locale} />;
}
