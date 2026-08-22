import { describe, expect, it } from 'vitest';
import { renderPromptTemplate } from '../packages/ai-core/src/planner/planner';

describe('prompt template rendering', () => {
  it('substitutes a completed step output', () => {
    const outputs = new Map([['outline', 'Chapter one: water']]);
    expect(renderPromptTemplate('Expand this: {{outline}}', outputs)).toBe(
      'Expand this: Chapter one: water',
    );
  });

  it('substitutes several references', () => {
    const outputs = new Map([['a', 'ONE'], ['b', 'TWO']]);
    expect(renderPromptTemplate('{{a}} then {{b}}', outputs)).toBe('ONE then TWO');
  });

  it('leaves an unresolved reference visible rather than silently blanking it', () => {
    // A blank would look like a legitimate empty result; the marker does not.
    expect(renderPromptTemplate('Use {{missing}}', new Map())).toBe('Use {{missing}}');
  });

  it('preserves Arabic and Urdu content in substituted output', () => {
    const outputs = new Map([['s', 'الفصل الأول']]);
    expect(renderPromptTemplate('اكتب: {{s}}', outputs)).toContain('الفصل الأول');
  });

  it('does not treat step output as a further template', () => {
    // Otherwise generated text containing {{x}} could pull in another step.
    const outputs = new Map([['a', 'contains {{b}}'], ['b', 'SECRET']]);
    expect(renderPromptTemplate('{{a}}', outputs)).toBe('contains {{b}}');
  });
});
