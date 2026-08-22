import { getTranslations } from 'next-intl/server';
import { prisma } from '@yarub/db';
import { isAdmin } from '../../../lib/admin';
import { AdminConsole } from '../../../components/AdminConsole';

/**
 * The administration area.
 *
 * Access is decided by the user's role in the database. A non-admin gets the
 * same refusal whether or not they are signed in, so this page reveals nothing
 * about its own existence.
 */
export default async function AdminPage() {
  const t = await getTranslations('admin');

  if (!(await isAdmin())) {
    return (
      <div className="max-w-md mx-auto p-10 text-center">
        <p className="text-ink-muted">{t('noAccess')}</p>
      </div>
    );
  }

  const [plans, userCount, activeSubs] = await Promise.all([
    prisma.plan.findMany({ orderBy: { priceMinor: 'asc' } }),
    prisma.user.count(),
    prisma.subscription.count({ where: { status: 'active' } }),
  ]);

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-10">
      <h1 className="text-2xl font-bold mb-6">{t('title')}</h1>
      <AdminConsole
        initialPlans={JSON.parse(JSON.stringify(plans))}
        stats={{ users: userCount, activeSubscriptions: activeSubs }}
      />
    </div>
  );
}
