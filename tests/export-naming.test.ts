import { describe, expect, it } from 'vitest';

/**
 * Mirrors the filename logic in the export route. Arabic and Urdu titles are
 * the normal case for this product, so the download must not break on them.
 */
function safeFilename(title: string): string {
  const ascii = title.replace(/[^\w\d-]+/g, '-').replace(/^-+|-+$/g, '');
  return ascii.length >= 3 ? ascii.slice(0, 60) : 'yarub-artifact';
}

describe('export filename', () => {
  it('falls back to ASCII for a fully Arabic title', () => {
    expect(safeFilename('كتاب العلوم للأطفال')).toBe('yarub-artifact');
  });

  it('falls back for a fully Urdu title', () => {
    expect(safeFilename('بچوں کی سائنس کتاب')).toBe('yarub-artifact');
  });

  it('keeps a Latin title readable', () => {
    expect(safeFilename('Arabic Science Book')).toBe('Arabic-Science-Book');
  });

  it('strips path separators and quotes that would break the header', () => {
    const name = safeFilename('../../etc/passwd"; rm -rf');
    expect(name).not.toContain('/');
    expect(name).not.toContain('"');
    expect(name).not.toContain('..');
  });

  it('caps length', () => {
    expect(safeFilename('a'.repeat(300)).length).toBeLessThanOrEqual(60);
  });
});
