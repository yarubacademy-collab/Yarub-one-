import { DOMAINS, type Locale, type Domain, AppError } from '@yarub/shared';
import type { TextProvider } from '@yarub/providers';
import { intentSchema, type Intent, CLARIFY_THRESHOLD } from './types.js';

/**
 * Step 1 of the AI Core pipeline.
 *
 * Two-stage design: a cheap deterministic pass handles the obvious cases
 * (script detection, explicit verbs) and an LLM pass handles the rest. This
 * keeps latency and cost down for the majority of requests and keeps the
 * classifier testable without a network call.
 */

const ARABIC_ONLY = /[\u0621-\u064A]/;
/** Characters that appear in Urdu but not in Arabic. */
const URDU_MARKERS = /[\u0679\u0688\u0691\u06BA\u06BE\u06C1\u06CC\u06D2\u0698]/;

export function detectLanguage(text: string): Locale {
  if (URDU_MARKERS.test(text)) return 'ur';
  if (ARABIC_ONLY.test(text)) return 'ar';
  return 'en';
}

/** Deterministic keyword signals, in all three languages. */
const DOMAIN_SIGNALS: Record<Domain, RegExp[]> = {
  image: [/\bimage\b|\bposter\b|\billustrat/i, /صورة|رسم|ملصق/, /تصویر|پوسٹر/],
  video: [/\bvideo\b|\bclip\b|\banimat/i, /فيديو|مقطع/, /ویڈیو/],
  website: [/\bwebsite\b|\bweb ?page\b|\blanding page\b/i, /موقع|صفحة ويب/, /ویب ?سائٹ/],
  game: [/\bgame\b|\bplayable\b|\bquiz game\b/i, /لعبة|ألعاب/, /گیم|کھیل/],
  education: [
    /\bhomework\b|\bworksheet\b|\bquiz\b|\blesson\b|\bexplain\b|\bteach\b/i,
    /واجب|ورقة عمل|درس|اختبار|اشرح/,
    /ہوم ?ورک|سبق|ورک ?شیٹ|سمجھا/,
  ],
  document: [/\bpdf\b|\bdocument\b|\bbook\b|\breport\b/i, /كتاب|مستند|تقرير/, /کتاب|دستاویز|رپورٹ/],
  visual: [/\binfographic\b|\bcertificate\b|\bdesign\b|\bpresentation\b/i, /إنفوجرافيك|شهادة|تصميم/, /ڈیزائن|سرٹیفکیٹ/],
  chat: [],
};

/** Signals that a request needs several coordinated steps rather than one reply. */
const PROJECT_SIGNALS = [
  /\bwith illustrations?\b|\bmulti-?page\b|\bcomplete\b|\bfull\b|\bchapters?\b/i,
  /مع الصور|كامل|متكامل|فصول|صفحات/,
  /تصاویر کے ساتھ|مکمل|ابواب/,
];

export interface HeuristicResult {
  language: Locale;
  domain: Domain | undefined;
  complexity: 'simple' | 'project' | undefined;
  confidence: number;
}

export function heuristicIntent(text: string): HeuristicResult {
  const language = detectLanguage(text);

  const matches = DOMAINS.filter((d) => DOMAIN_SIGNALS[d].some((re) => re.test(text)));
  const domain = matches.length === 1 ? matches[0] : undefined;

  const looksLikeProject =
    PROJECT_SIGNALS.some((re) => re.test(text)) ||
    matches.length > 1 ||
    text.length > 400;

  // A single unambiguous signal in a short request is enough to skip the LLM.
  const confidence = domain && !looksLikeProject && text.length < 200 ? 0.85 : 0.3;

  return {
    language,
    domain,
    complexity: looksLikeProject ? 'project' : domain ? 'simple' : undefined,
    confidence,
  };
}

const CLASSIFIER_INSTRUCTION = `Classify the user request. Reply with JSON only, no prose, no markdown fences.
{
  "domain": one of ${DOMAINS.join(' | ')},
  "language": "ar" | "ur" | "en",
  "complexity": "simple" | "project",
  "goal": short restatement of the goal in the user's own language,
  "entities": flat object of extracted parameters (audience, topic, count, style, length...),
  "confidence": 0.0 to 1.0
}
"simple" means one capability call answers it fully.
"project" means several coordinated steps produce a saved artifact.`;

export interface IntentResolverDeps {
  textProvider: TextProvider;
}

export class IntentResolver {
  constructor(private readonly deps: IntentResolverDeps) {}

  async resolve(text: string): Promise<Intent> {
    const fast = heuristicIntent(text);

    if (fast.confidence >= 0.8 && fast.domain && fast.complexity) {
      return {
        domain: fast.domain,
        language: fast.language,
        complexity: fast.complexity,
        goal: text.slice(0, 500),
        entities: {},
        confidence: fast.confidence,
      };
    }

    const res = await this.deps.textProvider.generate({
      messages: [
        { role: 'system', content: CLASSIFIER_INSTRUCTION },
        { role: 'user', content: text.slice(0, 8000) },
      ],
      language: fast.language,
      temperature: 0,
      maxOutputTokens: 600,
    });

    const parsed = intentSchema.safeParse(safeJson(res.text));
    if (!parsed.success) {
      // Never guess silently: fall back to the heuristic and flag low confidence
      // so the caller asks a clarifying question instead of inventing a plan.
      return {
        domain: fast.domain ?? 'chat',
        language: fast.language,
        complexity: fast.complexity ?? 'simple',
        goal: text.slice(0, 500),
        entities: {},
        confidence: 0.4,
      };
    }

    // Script detection beats the model on language: it is exact.
    return { ...parsed.data, language: fast.language };
  }
}

export function needsClarification(intent: Intent): boolean {
  return intent.confidence < CLARIFY_THRESHOLD;
}

/** Models sometimes wrap JSON in fences despite instructions. Strip and parse. */
export function safeJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw new AppError('PLAN_INVALID', 'Model did not return parsable JSON');
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}
