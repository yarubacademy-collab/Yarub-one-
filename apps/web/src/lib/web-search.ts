/**
 * Live web search for time-sensitive questions (weather, prices, news,
 * scores, "today", "right now"...). The rest of the product never reaches
 * the open internet outside a configured provider; this is the one narrow
 * exception, and it is gated entirely behind an optional key.
 *
 * Wired directly into the chat route rather than into the AI Core, because
 * this is a lookup, not a capability: a missing key or a failed request
 * must never change what the model classifies the request as — only what
 * context it sees once classification has already happened.
 */

const LIVE_INFO_PATTERNS = [
  // English
  /\b(weather|temperature|forecast|today'?s?|current(ly)?|right now|latest|score|breaking news|exchange rate|stock price|what time is it)\b/i,
  // Arabic
  /الطقس|درجة الحرارة|اليوم|الآن|آخر الأخبار|سعر الصرف|نتيجة المباراة/,
  // Urdu
  /موسم|درجہ حرارت|آج کا|ابھی|تازہ ترین|خبریں|قیمت|اسکور/,
];

/** True when the request looks like it needs information newer than any model's training. */
export function needsLiveInfo(text: string): boolean {
  return LIVE_INFO_PATTERNS.some((pattern) => pattern.test(text));
}

interface TavilyResult {
  title: string;
  content: string;
}

interface TavilyResponse {
  answer?: string;
  results?: TavilyResult[];
}

/**
 * Returns a short, model-ready summary of current web results, or null when
 * no key is configured or the lookup fails for any reason. A search failure
 * must never break chat — the caller falls back to answering without live
 * context, exactly as before this feature existed.
 */
export async function webSearch(query: string): Promise<string | null> {
  const apiKey = process.env.SEARCH_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        max_results: 5,
        include_answer: true,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as TavilyResponse;
    const parts: string[] = [];

    if (data.answer) parts.push(data.answer);
    for (const result of data.results ?? []) {
      parts.push(`${result.title}: ${result.content}`.slice(0, 500));
    }

    return parts.length > 0 ? parts.join('\n\n').slice(0, 3000) : null;
  } catch {
    return null;
  }
}
