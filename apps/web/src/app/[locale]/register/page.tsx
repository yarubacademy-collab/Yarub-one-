import type { Locale } from '@yarub/shared';
import { AuthForm } from '../../../components/AuthForm';

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <AuthForm mode="register" locale={locale as Locale} />;
}
