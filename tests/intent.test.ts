import { describe, expect, it } from 'vitest';
import { detectLanguage, heuristicIntent, safeJson } from '../packages/ai-core/src/intent/resolver';

describe('language detection', () => {
  it('detects Arabic', () => {
    expect(detectLanguage('أنشئ كتابًا تعليميًا للأطفال')).toBe('ar');
  });

  it('detects Urdu by its distinctive letters', () => {
    expect(detectLanguage('بچوں کے لیے ایک کتاب بنائیں')).toBe('ur');
  });

  it('detects English', () => {
    expect(detectLanguage('Create an educational book')).toBe('en');
  });

  it('does not mistake Urdu for Arabic', () => {
    expect(detectLanguage('میرے لیے ویب سائٹ بنائیں')).not.toBe('ar');
  });
});

describe('heuristic intent', () => {
  it('routes a short unambiguous website request without an LLM call', () => {
    const result = heuristicIntent('Create a website');
    expect(result.domain).toBe('website');
    expect(result.complexity).toBe('simple');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('treats an illustrated Arabic book as a project', () => {
    const result = heuristicIntent('أنشئ كتاب علوم للأطفال مع الصور');
    expect(result.language).toBe('ar');
    expect(result.complexity).toBe('project');
  });

  it('defers to the model when signals conflict', () => {
    const result = heuristicIntent('Create a website with a video and an image gallery');
    expect(result.confidence).toBeLessThan(0.8);
  });
});

describe('safeJson', () => {
  it('parses fenced JSON', () => {
    expect(safeJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('recovers JSON surrounded by prose', () => {
    expect(safeJson('Sure! {"a":2} hope that helps')).toEqual({ a: 2 });
  });

  it('throws rather than guessing when there is no JSON', () => {
    expect(() => safeJson('no json here')).toThrow();
  });
});
