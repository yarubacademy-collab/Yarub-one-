import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@yarub/db';
import { loadConfig } from '@yarub/config';
import { currentUserId } from '../../../../lib/session';
import { ArtifactPreview } from '../../../../components/ArtifactPreview';

/**
 * Shapes declared explicitly rather than inferred from the Prisma client, so
 * this file typechecks on a clean checkout before `prisma generate` has run.
 */
interface ArtifactVersionRow {
  id: string;
  version: number;
}
interface ArtifactRow {
  id: string;
  type: string;
  title: string;
  versions: ArtifactVersionRow[];
}
interface JobRow {
  id: string;
  status: string;
  steps: Array<{ status: string }>;
}

/**
 * A project is the unit of continuity: close the app, return days later, and
 * the conversation, jobs, artifacts and versions are all still here.
 */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations('project');
  const tJob = await getTranslations('job');

  const userId = await currentUserId();
  if (!userId) notFound();

  // Ownership is part of the query, not a check after the fact.
  const project = await prisma.project.findFirst({
    where: { id, userId },
    include: {
      artifacts: { include: { versions: { orderBy: { version: 'desc' } } } },
      jobs: { orderBy: { createdAt: 'desc' }, take: 10, include: { steps: true } },
      assets: { orderBy: { createdAt: 'desc' }, take: 24 },
    },
  });
  if (!project) notFound();

  const previewOrigin = loadConfig().PREVIEW_ORIGIN;

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-8">
      <header>
        <h1 className="text-2xl font-bold">{project.title}</h1>
        <p className="text-sm text-ink-muted mt-1">{project.domain}</p>
      </header>

      <section>
        <h2 className="font-semibold mb-3">{t('artifacts')}</h2>
        {project.artifacts.length === 0 ? (
          <p className="text-ink-muted text-sm">{t('empty')}</p>
        ) : (
          <div className="space-y-6">
            {(project.artifacts as ArtifactRow[]).map((artifact) => {
              const latest = artifact.versions[0];
              if (!latest) return null;

              const runnable = artifact.type === 'website' || artifact.type === 'game';
              return runnable ? (
                <ArtifactPreview
                  key={artifact.id}
                  previewOrigin={previewOrigin}
                  versionId={latest.id}
                  title={artifact.title}
                />
              ) : (
                <div key={artifact.id} className="y-card p-4 flex items-center justify-between gap-4">
                  <span className="min-w-0 truncate">{artifact.title}</span>
                  <span className="flex items-center gap-3 shrink-0 text-sm">
                    <span className="text-ink-muted numeral">v{latest.version}</span>
                    <a href={`/api/artifacts/${latest.id}/export`} className="underline hover:text-ink">
                      {t('export')}
                    </a>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold mb-3">{tJob('planTitle')}</h2>
        <ul className="y-card divide-y divide-edge">
          {(project.jobs as JobRow[]).map((job) => (
            <li key={job.id} className="flex items-center justify-between gap-4 p-4">
              <span className="text-sm text-ink-muted">
                {job.steps.filter((s: { status: string }) => s.status === 'succeeded').length}/{job.steps.length}
              </span>
              <span className="text-xs">{tJob(job.status === 'succeeded' ? 'succeeded' : job.status === 'failed' ? 'failed' : job.status === 'cancelled' ? 'cancelled' : 'running')}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
