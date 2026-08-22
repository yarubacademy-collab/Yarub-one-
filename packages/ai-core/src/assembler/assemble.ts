import type { ArtifactType, Capability, Locale } from '@yarub/shared';
import { stripActiveMarkup } from '../guardrails/index.js';
import type { Plan } from '../planner/plan.schema.js';
import type { JobOutcome } from '../orchestrator/orchestrator.js';

/**
 * Step 6 of the pipeline: many step outputs become one thing the user receives.
 *
 * The Assembler decides shape, not content. It never invents material to cover
 * a step that did not run — a missing image stays a declared gap.
 */

export interface AssembledArtifact {
  type: ArtifactType;
  title: string;
  language: Locale;
  /** Files to persist; the caller writes them to object storage. */
  files: AssembledFile[];
  /** Capabilities that were required but unconfigured, surfaced to the user. */
  gaps: Capability[];
}

export interface AssembledFile {
  path: string;
  mime: string;
  content: string;
}

export interface AssembleInput {
  plan: Plan;
  outcome: JobOutcome;
}

export function assemble(input: AssembleInput): AssembledArtifact {
  const { plan, outcome } = input;
  const title = plan.title[plan.language];
  const base = {
    title,
    language: plan.language,
    gaps: outcome.notConfigured,
  };

  switch (plan.outputArtifactType) {
    case 'website':
      return { ...base, type: 'website', files: assembleWebBundle(plan, outcome, 'website') };
    case 'game':
      return { ...base, type: 'game', files: assembleWebBundle(plan, outcome, 'game') };
    case 'document':
      return { ...base, type: 'document', files: [assembleDocument(plan, outcome)] };
    case 'image-set':
    case 'video':
      return { ...base, type: plan.outputArtifactType, files: [assembleManifest(plan, outcome)] };
    case 'message':
    default:
      return { ...base, type: 'message', files: [assembleMessage(plan, outcome)] };
  }
}

function orderedOutputs(plan: Plan, outcome: JobOutcome): Array<{ id: string; text: string }> {
  return plan.steps
    .map((step) => ({ id: step.id, text: outcome.outputs.get(step.id) ?? '' }))
    .filter((entry) => entry.text.length > 0);
}

function assembleMessage(plan: Plan, outcome: JobOutcome): AssembledFile {
  return {
    path: 'response.md',
    mime: 'text/markdown',
    content: orderedOutputs(plan, outcome)
      .map((o) => o.text)
      .join('\n\n'),
  };
}

/**
 * Website and game bundles share a shape: an entry document plus assets,
 * later served from the sandbox origin. Active markup from separate steps is
 * stripped before it is stitched in; only the code step may contain script.
 */
function assembleWebBundle(plan: Plan, outcome: JobOutcome, kind: 'website' | 'game'): AssembledFile[] {
  const codeSteps = plan.steps.filter((s) => s.capability === 'code.generate');
  const files: AssembledFile[] = [];

  for (const step of codeSteps) {
    const raw = outcome.outputs.get(step.id);
    if (!raw) continue;
    for (const file of splitCodeBlocks(raw)) files.push(file);
  }

  if (!files.some((f) => f.path === 'index.html')) {
    const textual = plan.steps
      .filter((s) => s.capability !== 'code.generate')
      .map((s) => outcome.outputs.get(s.id))
      .filter((v): v is string => Boolean(v))
      .map(stripActiveMarkup)
      .join('\n');

    files.unshift({
      path: 'index.html',
      mime: 'text/html',
      content: fallbackShell(plan, textual, kind),
    });
  }

  return files;
}

/**
 * Models emit multi-file output as fenced blocks with a path hint.
 * Anything unlabelled becomes index.html so a bundle is always runnable.
 */
export function splitCodeBlocks(raw: string): AssembledFile[] {
  const pattern = /```([a-z]*)\s*(?:\/\/\s*|<!--\s*)?([\w./-]+\.(?:html|css|js|json))?\s*\n([\s\S]*?)```/gi;
  const files: AssembledFile[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(raw)) !== null) {
    const lang = (match[1] ?? '').toLowerCase();
    const declared = match[2];
    const body = (match[3] ?? '').trim();
    if (!body) continue;

    const path =
      declared ??
      (lang === 'css' ? 'styles.css' : lang === 'js' || lang === 'javascript' ? 'app.js' : 'index.html');

    files.push({ path, mime: mimeFor(path), content: body });
  }

  if (files.length === 0 && raw.trim()) {
    files.push({ path: 'index.html', mime: 'text/html', content: raw.trim() });
  }
  return files;
}

function mimeFor(path: string): string {
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.js')) return 'text/javascript';
  if (path.endsWith('.json')) return 'application/json';
  return 'text/html';
}

function fallbackShell(plan: Plan, body: string, kind: 'website' | 'game'): string {
  const dir = plan.language === 'en' ? 'ltr' : 'rtl';
  return `<!doctype html>
<html lang="${plan.language}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(plan.title[plan.language])}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body data-kind="${kind}">
<main>${body}</main>
<script src="app.js"></script>
</body>
</html>`;
}

/** Document assembly keeps RTL direction and marks unfilled visual slots. */
function assembleDocument(plan: Plan, outcome: JobOutcome): AssembledFile {
  const sections = plan.steps.map((step) => {
    const output = outcome.outputs.get(step.id);
    if (output) return output;
    const record = outcome.records.find((r) => r.stepKey === step.id);
    if (record?.status === 'not_configured') {
      return `<!-- ${step.title[plan.language]}: not configured -->`;
    }
    return '';
  });

  return {
    path: 'document.md',
    mime: 'text/markdown',
    content: [`# ${plan.title[plan.language]}`, '', ...sections].join('\n\n'),
  };
}

function assembleManifest(plan: Plan, outcome: JobOutcome): AssembledFile {
  return {
    path: 'manifest.json',
    mime: 'application/json',
    content: JSON.stringify(
      {
        title: plan.title,
        language: plan.language,
        type: plan.outputArtifactType,
        items: plan.steps.map((s) => ({
          id: s.id,
          title: s.title,
          status: outcome.records.find((r) => r.stepKey === s.id)?.status ?? 'pending',
          ref: outcome.outputs.get(s.id) ?? null,
        })),
      },
      null,
      2,
    ),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
