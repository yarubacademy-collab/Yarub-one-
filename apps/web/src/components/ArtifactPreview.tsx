'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * The only place generated code is ever displayed.
 *
 * Three properties hold simultaneously, and all three are required:
 *   1. src points at PREVIEW_ORIGIN, a different host from this app;
 *   2. sandbox omits allow-same-origin, so the frame runs in an opaque origin
 *      and cannot read cookies, storage, or the parent document even though
 *      it is same-site;
 *   3. the preview server sends a CSP with no connect-src, so the code inside
 *      cannot phone home or reach our API.
 *
 * Removing any one of them would make the other two insufficient.
 */
export function ArtifactPreview({
  previewOrigin,
  versionId,
  title,
}: {
  previewOrigin: string;
  versionId: string;
  title: string;
}) {
  const t = useTranslations('project');
  const [reloadKey, setReloadKey] = useState(0);

  const src = `${previewOrigin}/p/${versionId}/index.html`;

  return (
    <section className="y-card overflow-hidden">
      <header className="flex items-center justify-between gap-4 border-b border-edge px-4 py-3">
        <h2 className="font-semibold truncate min-w-0">{title}</h2>
        <div className="flex items-center gap-3 shrink-0 text-sm">
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="text-ink-muted hover:text-ink"
          >
            ↻
          </button>
          <a
            href={`/api/artifacts/${versionId}/export`}
            className="text-ink-muted hover:text-ink underline"
          >
            {t('export')}
          </a>
        </div>
      </header>

      <iframe
        key={reloadKey}
        src={src}
        title={title}
        sandbox="allow-scripts allow-forms allow-pointer-lock"
        referrerPolicy="no-referrer"
        loading="lazy"
        className="w-full h-[70vh] bg-white"
      />
    </section>
  );
}
