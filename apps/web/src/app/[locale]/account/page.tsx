import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { prisma } from '@yarub/db';
import { currentUserId } from '../../../lib/session';
import { resolveEntitlements } from '../../../lib/entitlements';
import { UsagePanel } from '../../../components/UsagePanel';

export const dynamic = 'force-dynamic';

/**
 * Account: who you are, what plan you are on, what you have left.
 */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('plan');
  const tMeter = await getTranslations('meter');
  const tAuth = await getTranslations('auth');

  const userId = await currentUserId();
  if (!userId) {
    return (
      <div className="max-w-md mx-auto p-10 text-center">
        <Link href={`/${locale}/login`} className="y-primary inline-block">
          {tAuth('signIn')}
        </Link>
      </div>
    );
  }

  const [user, entitlements] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true, createdAt: true },
    }),
    resolveEntitlements(userId),
  ]);

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10 space-y-8">
      <header>
        <h1 className="text-2xl font-bold">{user?.email}</h1>
        <p className="text-sm text-ink-muted mt-1">
          {t('current')}: {t(entitlements.planCode as 'free')}
        </p>
      </header>

      <section className="y-card divide-y divide-edge">
        {entitlements.allowance.map((row) => (
          <div key={row.action} className="flex items-center justify-between gap-4 p-4">
            <span>{tMeter(row.action)}</span>
            <span className="numeral text-sm">
              {row.remaining} / {row.limit} {t('remaining')}
            </span>
          </div>
        ))}
      </section>

      <p className="text-sm text-ink-muted">
        {t('renews')}:{' '}
        <span className="numeral">{entitlements.period.end.toISOString().slice(0, 10)}</span>
      </p>

      {entitlements.planCode === 'free' && (
        <Link href={`/${locale}/pricing`} className="y-primary inline-block">
          {t('upgrade')}
        </Link>
      )}

      <UsagePanel />
