import { describe, expect, it } from 'vitest';
import { assemble, splitCodeBlocks } from '../packages/ai-core/src/assembler/assemble';
import { planSchema } from '../packages/ai-core/src/planner/plan.schema';
import type { JobOutcome } from '../packages/ai-core/src/orchestrator/orchestrator';

const L = (s: string) => ({ ar: s, ur: s, en: s });

const plan = (type: string, steps: Array<{ id: string; cap?: string }>) =>
  planSchema.parse({
    title: L('عنوان'),
    domain: 'website',
    language: 'ar',
    outputArtifactType: type,
    edges: [],
    steps: steps.map((s) => ({
      id: s.id,
      title: L(s.id),
      capability: s.cap ?? 'text.generate',
      input: { promptTemplate: s.id, dependsOnOutputs: [] },
      output: { kind: 'text' },
      optional: false,
    })),
  });

const outcome = (outputs: Record<string, string>, notConfigured: string[] = []): JobOutcome => ({
  status: 'succeeded',
  records: Object.keys(outputs).map((k) => ({ stepKey: k, status: 'succeeded' as const, attempts: 1 })),
  outputs: new Map(Object.entries(outputs)),
  notConfigured: notConfigured as never[],
});

describe('code block splitting', () => {
  it('splits a multi-file website response by declared path', () => {
    const raw = [
      '```html index.html', '<h1>مرحبا</h1>', '```',
      '```css styles.css', 'body{margin:0}', '```',
      '```js app.js', 'console.log(1)', '```',
    ].join('\n');
    const files = splitCodeBlocks(raw);
    expect(files.map((f) => f.path).sort()).toEqual(['app.js', 'index.html', 'styles.css']);
    expect(files.find((f) => f.path === 'styles.css')?.mime).toBe('text/css');
  });

  it('always produces a runnable entry file', () => {
    const files = splitCodeBlocks('<h1>hello</h1>');
    expect(files[0].path).toBe('index.html');
  });
});

describe('assembler', () => {
  it('builds an RTL shell when the model returned no entry file', () => {
    const result = assemble({
      plan: plan('website', [{ id: 'copy' }]),
      outcome: outcome({ copy: '<p>محتوى</p>' }),
    });
    const index = result.files.find((f) => f.path === 'index.html')!;
    expect(index.content).toContain('dir="rtl"');
    expect(index.content).toContain('lang="ar"');
  });

  it('strips active markup coming from non-code steps', () => {
    const result = assemble({
      plan: plan('website', [{ id: 'copy' }]),
      outcome: outcome({ copy: '<p>ok</p><script>evil()</script>' }),
    });
    expect(result.files[0].content).not.toContain('evil()');
  });

  it('declares a gap instead of inventing a missing image', () => {
    const result = assemble({
      plan: plan('document', [{ id: 'text' }, { id: 'art', cap: 'image.generate' }]),
      outcome: outcome({ text: 'الفصل الأول' }, ['image.generate']),
    });
    expect(result.gaps).toContain('image.generate');
    expect(result.files[0].content).toContain('الفصل الأول');
    expect(result.files[0].content).not.toContain('placeholder-image');
  });
});
