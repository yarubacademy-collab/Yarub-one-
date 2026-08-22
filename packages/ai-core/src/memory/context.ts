import type { Locale } from '@yarub/shared';
import type { TextMessage } from '@yarub/providers';
import { systemPrompt } from '../prompts/system.js';

/**
 * Context/Memory Manager.
 *
 * Keeps a conversation inside the model's window without losing the thread:
 * recent turns verbatim, older turns as a rolling summary, plus a compact
 * description of the project the conversation belongs to.
 */

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface ProjectContext {
  title: string;
  domain: string;
  /** Titles of artifacts already produced, so the model can refer back to them. */
  artifacts: string[];
}

export interface BuildContextInput {
  locale: Locale;
  education?: boolean;
  messages: StoredMessage[];
  project?: ProjectContext;
  rollingSummary?: string;
  /** Approximate budget; 4 chars per token is a safe cross-language estimate. */
  maxChars?: number;
}

export function buildContext(input: BuildContextInput): TextMessage[] {
  const maxChars = input.maxChars ?? 40_000;
  const out: TextMessage[] = [
    { role: 'system', content: systemPrompt(input.locale, input.education ?? false) },
  ];

  if (input.project) {
    out.push({
      role: 'system',
      content: [
        `Current project: ${input.project.title} (${input.project.domain}).`,
        input.project.artifacts.length
          ? `Existing artifacts: ${input.project.artifacts.join(', ')}.`
          : 'No artifacts produced yet.',
      ].join(' '),
    });
  }

  if (input.rollingSummary) {
    out.push({ role: 'system', content: `Earlier in this conversation: ${input.rollingSummary}` });
  }

  // Walk backwards so the most recent turns always survive truncation.
  const kept: TextMessage[] = [];
  let used = out.reduce((n, m) => n + m.content.length, 0);
  for (let i = input.messages.length - 1; i >= 0; i -= 1) {
    const message = input.messages[i]!;
    if (used + message.content.length > maxChars) break;
    used += message.content.length;
    kept.unshift({ role: message.role, content: message.content });
  }

  return [...out, ...kept];
}

/** Which older messages should be folded into a summary on the next write. */
export function messagesToCompact(messages: StoredMessage[], keepRecent = 12): StoredMessage[] {
  return messages.length <= keepRecent ? [] : messages.slice(0, messages.length - keepRecent);
}
