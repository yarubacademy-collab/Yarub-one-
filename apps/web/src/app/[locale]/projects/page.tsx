import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@yarub/db';
import { currentUserId } from '../../../lib/session';
export const dynamic = 'force-dynamic';

/**
 * Projects are the continuity mechanism: close the app, come back, carry on.
 */
interface ProjectRow {
  id: string;
  title: string;
  _count: { artifacts: number; jobs: number };
}

export default async function ProjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('project');
  const userId = await currentUserId();

  const projects = userId
    ? await prisma.project.findMany({
        where: { userId, archived: false },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: { _count: { select: { artifacts: true, jobs: true } } },
      })
    : [];

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10">
      <h1 className="text-2xl font-bold mb-6">{t('title')}</h1>

      {projects.length === 0 ? (
        <p className="text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="y-card divide-y divide-edge">
          {(projects as ProjectRow[]).map((project) => (
            <li key={project.id}>
              <Link
                href={`/${locale}/projects/${project.id}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-parchment-sunk transition-colors"
              >
                <span className="min-w-0 truncate font-medium">{project.title}</span>
                <span className="text-xs text-ink-muted numeral shrink-0">
                  {project._count.artifacts} · {project._count.jobs}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
