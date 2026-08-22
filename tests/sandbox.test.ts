import { describe, expect, it } from 'vitest';
import {
  SANDBOX_ATTR,
  buildCsp,
  harden,
  normalizePath,
  packageBundle,
} from '../packages/sandbox/src/index';

describe('sandbox path handling', () => {
  it('accepts ordinary bundle paths', () => {
    expect(normalizePath('./index.html')).toBe('index.html');
    expect(normalizePath('assets/styles.css')).toBe('assets/styles.css');
  });

  it('rejects directory traversal', () => {
    expect(() => normalizePath('../../etc/passwd')).toThrow();
    expect(() => normalizePath('assets/../../secret.html')).toThrow();
  });

  it('rejects absolute paths and unexpected file types', () => {
    expect(() => normalizePath('/etc/hosts')).toThrow();
    expect(() => normalizePath('payload.php')).toThrow();
    expect(() => normalizePath('run.sh')).toThrow();
  });
});

describe('hardening generated html', () => {
  it('removes nested frames and remote script tags', () => {
    const html = '<iframe src="http://evil"></iframe><script src="https://evil/x.js"></script>';
    const clean = harden(html);
    expect(clean).not.toContain('<iframe');
    expect(clean).not.toContain('evil/x.js');
  });

  it('neutralises attempts to reach the parent window', () => {
    const clean = harden('<script>parent.postMessage(document.cookie)</script>');
    expect(clean).not.toMatch(/\bparent\b/);
  });

  it('drops remote stylesheets', () => {
    expect(harden('<link rel="stylesheet" href="https://cdn.example/x.css">')).not.toContain('cdn.example');
  });
});

describe('csp and sandbox attributes', () => {
  it('forbids all outbound connections by default', () => {
    const csp = buildCsp();
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('connect-src');
    expect(csp).toContain("form-action 'none'");
  });

  it('withholds allow-same-origin so the frame gets an opaque origin', () => {
    expect(SANDBOX_ATTR).toContain('allow-scripts');
    expect(SANDBOX_ATTR).not.toContain('allow-same-origin');
  });
});

describe('bundle packaging', () => {
  it('requires an entry document', () => {
    expect(() => packageBundle([{ path: 'styles.css', mime: 'text/css', content: 'a{}' }])).toThrow();
  });

  it('packages a valid bundle with policy attached', () => {
    const bundle = packageBundle([
      { path: 'index.html', mime: 'text/html', content: '<h1>مرحبا</h1>' },
      { path: 'styles.css', mime: 'text/css', content: 'body{margin:0}' },
    ]);
    expect(bundle.files).toHaveLength(2);
    expect(bundle.csp).toContain("object-src 'none'");
  });

  it('rejects an unsafe path inside an otherwise valid bundle', () => {
    expect(() =>
      packageBundle([
        { path: 'index.html', mime: 'text/html', content: 'ok' },
        { path: '../escape.html', mime: 'text/html', content: 'bad' },
      ]),
    ).toThrow();
  });
});
