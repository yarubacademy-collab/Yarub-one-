import { marked } from 'marked';
import type { Locale } from '@yarub/shared';
import { isRtl } from '@yarub/shared';

/**
 * Document rendering.
 *
 * Arabic and Urdu are the reason this runs locally rather than through a
 * service: correct shaping, ligatures and line-breaking need the right font
 * stack and a real layout engine. Nastaliq in particular needs generous
 * line-height or ascenders collide.
 */

export interface RenderPdfInput {
  markdown: string;
  language: Locale;
  title: string;
  /** Storage keys or data URLs already resolved by the caller. */
  images?: Record<string, string>;
}

const FONT_STACK: Record<Locale, string> = {
  ar: "'IBM Plex Sans Arabic', 'Noto Kufi Arabic', 'Segoe UI', sans-serif",
  ur: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif",
  en: "'Inter', 'Segoe UI', system-ui, sans-serif",
};

/** Nastaliq needs much more vertical room than Naskh or Latin. */
const LINE_HEIGHT: Record<Locale, number> = { ar: 1.9, ur: 2.6, en: 1.6 };

export function documentHtml(input: RenderPdfInput): string {
  const dir = isRtl(input.language) ? 'rtl' : 'ltr';
  let body = marked.parse(input.markdown, { async: false }) as string;

  for (const [key, url] of Object.entries(input.images ?? {})) {
    body = body.split(`{{image:${key}}}`).join(`<img src="${url}" alt="">`);
  }

  return `<!doctype html>
<html lang="${input.language}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(input.title)}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  html { font-family: ${FONT_STACK[input.language]}; }
  body {
    line-height: ${LINE_HEIGHT[input.language]};
    font-size: ${input.language === 'ur' ? '15pt' : '12pt'};
    color: #16181d;
    text-align: ${dir === 'rtl' ? 'right' : 'left'};
  }
  h1, h2, h3 { line-height: 1.4; margin-block: 1.4em 0.5em; font-weight: 700; }
  h1 { font-size: 1.9em; border-block-end: 2px solid #d8d3c8; padding-block-end: .3em; }
  p { margin-block: 0 .9em; }
  img { max-width: 100%; height: auto; display: block; margin-inline: auto; margin-block: 1em; }
  table { width: 100%; border-collapse: collapse; margin-block: 1em; }
  th, td { border: 1px solid #d8d3c8; padding: .5em .7em; text-align: ${dir === 'rtl' ? 'right' : 'left'}; }
  ul, ol { padding-inline-start: 1.5em; }
  code { font-family: ui-monospace, monospace; background: #f2efe9; padding: .1em .3em; }
  /* Keep headings with their content across page breaks. */
  h1, h2, h3 { break-after: avoid; }
  img, table { break-inside: avoid; }
</style>
</head>
<body>${body}</body>
</html>`;
}

/**
 * Uses a headless browser so RTL shaping matches what the user previewed.
 * Imported lazily: the web process should not pay for a browser binary it
 * never launches.
 */
export async function renderPdf(input: RenderPdfInput): Promise<Uint8Array> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(documentHtml(input), { waitUntil: 'networkidle' });
    const buffer = await page.pdf({ format: 'A4', printBackground: true });
    return new Uint8Array(buffer);
  } finally {
    await browser.close();
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
