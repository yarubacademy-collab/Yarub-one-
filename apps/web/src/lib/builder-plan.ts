import type { Locale } from '@yarub/shared';
import { planSchema, type Plan } from '@yarub/ai-core';

/**
 * What the Websites and Games pages ask for.
 *
 * Those pages used to send a request to the same classifier as the chat box,
 * which often took "make me a calculator site" for an ordinary question and
 * answered it as text: code pasted into a conversation, not a file. On a page
 * whose whole purpose is one kind of file, there is nothing to classify, so the
 * plan is fixed here instead: one step that produces the finished file.
 *
 * One step also means one model call rather than a planning call, a repair
 * attempt and then the build, which matters on a free model allowance.
 */

export type BuilderKind = 'website' | 'game';

const PLAN_TITLE: Record<BuilderKind, Record<Locale, string>> = {
  website: { ar: 'موقعك الإلكتروني', ur: 'آپ کی ویب سائٹ', en: 'Your website' },
  game: { ar: 'لعبتك', ur: 'آپ کا گیم', en: 'Your game' },
};

const STEP_TITLE: Record<BuilderKind, Record<Locale, string>> = {
  website: { ar: 'إنشاء الموقع', ur: 'ویب سائٹ بنانا', en: 'Building the website' },
  game: { ar: 'إنشاء اللعبة', ur: 'گیم بنانا', en: 'Building the game' },
};

/** The single file is the deliverable: it has to open on its own, offline, on a phone. */
const BRIEF: Record<BuilderKind, string> = {
  website:
    'Build a complete, polished, responsive single-page website for the request below. ' +
    'Put everything in ONE self-contained index.html: CSS inside a <style> tag and any ' +
    'JavaScript inside a <script> tag. No external libraries, fonts, images or network ' +
    'requests; use CSS, emoji or inline SVG for visuals. Write all visible text in the ' +
    'same language as the request.',
  game:
    'Build a complete, playable browser game for the request below. Put everything in ONE ' +
    'self-contained index.html with CSS and JavaScript inline. No external libraries, ' +
    'images, audio or network requests; draw with canvas, CSS or emoji. Show clear ' +
    'on-screen instructions and a score, provide a way to restart, and support both touch ' +
    'and keyboard controls. Write all visible text in the same language as the request.',
};

/** Leaves room under the plan schema's own limit for the brief above. */
const MAX_REQUEST_CHARS = 6000;

export function builderPlan(kind: BuilderKind, request: string, locale: Locale): Plan {
  return planSchema.parse({
    title: PLAN_TITLE[kind],
    domain: kind,
    language: locale,
    outputArtifactType: kind,
    steps: [
      {
        id: 'build',
        title: STEP_TITLE[kind],
        capability: 'code.generate',
        input: {
          promptTemplate: `${BRIEF[kind]}\n\nRequest:\n${request.slice(0, MAX_REQUEST_CHARS)}`,
          dependsOnOutputs: [],
        },
        output: { kind: 'file' },
        optional: false,
      },
    ],
    edges: [],
  });
}
