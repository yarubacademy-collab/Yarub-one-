import { AppError } from '@yarub/shared';

/**
 * Generated code is untrusted by definition: a model wrote it, and it may have
 * been shaped by content the user pasted in. It therefore never runs on the
 * application origin, never sees a session cookie, and never reaches the
 * network. This module packages a bundle so those properties hold.
 */

export interface BundleFile {
  path: string;
  mime: string;
  content: string;
}

export interface PackagedBundle {
  files: BundleFile[];
  /** Value for the Content-Security-Policy header on the preview origin. */
  csp: string;
  /** Value for the iframe sandbox attribute. */
  sandboxAttr: string;
}

/**
 * allow-scripts without allow-same-origin: the frame gets a unique opaque
 * origin, so it cannot read cookies, localStorage or the parent document even
 * though it is served from a different host.
 */
export const SANDBOX_ATTR = 'allow-scripts allow-forms allow-pointer-lock';

const PATH_RULE = /^[a-z0-9][a-z0-9._/-]{0,120}$/i;
const ALLOWED_EXT = ['.html', '.css', '.js', '.json', '.svg'];

export function buildCsp(): string {
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'self'",
    "style-src 'unsafe-inline' 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    // No connect-src: generated code cannot call out anywhere, including back to us.
    "form-action 'none'",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
}

export function packageBundle(files: BundleFile[]): PackagedBundle {
  if (files.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'Empty bundle', 'کوئی فائل تیار نہیں ہوئی۔');
  }

  const safe = files.map((file) => {
    const path = normalizePath(file.path);
    return { ...file, path, content: file.path.endsWith('.html') ? harden(file.content) : file.content };
  });

  if (!safe.some((f) => f.path === 'index.html')) {
    throw new AppError('VALIDATION_FAILED', 'Bundle has no index.html', 'مرکزی صفحہ موجود نہیں۔');
  }

  return { files: safe, csp: buildCsp(), sandboxAttr: SANDBOX_ATTR };
}

/** Blocks traversal, absolute paths and unexpected file types. */
export function normalizePath(raw: string): string {
  const path = raw.replace(/^\.\//, '').replace(/^\/+/, '');
  if (path.includes('..') || !PATH_RULE.test(path)) {
    throw new AppError('VALIDATION_FAILED', `Unsafe bundle path: ${raw}`);
  }
  if (!ALLOWED_EXT.some((ext) => path.endsWith(ext))) {
    throw new AppError('VALIDATION_FAILED', `Disallowed file type in bundle: ${raw}`);
  }
  return path;
}

/**
 * Removes the things generated pages should never contain: outbound requests,
 * nested frames, and anything reaching for the parent window.
 */
export function harden(html: string): string {
  return html
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '<!-- nested frame removed -->')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/\b(?:window\.)?(?:parent|top|opener)\b/g, 'undefined')
    .replace(/<link\b[^>]*\bhref\s*=\s*["']https?:\/\/[^"']*["'][^>]*>/gi, '')
    .replace(/<script\b[^>]*\bsrc\s*=\s*["']https?:\/\/[^"']*["'][^>]*>\s*<\/script>/gi, '');
}

/** Headers the preview origin must send for every bundle response. */
export function previewHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': buildCsp(),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cache-Control': 'private, max-age=0, must-revalidate',
  };
}
