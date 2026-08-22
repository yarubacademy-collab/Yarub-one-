import type { Locale } from '@yarub/shared';
import { AuthForm } from '../../../components/AuthForm';

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <AuthForm mode="login" locale={locale as Locale} />;
}
