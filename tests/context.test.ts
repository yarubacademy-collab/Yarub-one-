import { describe, expect, it } from 'vitest';
import { buildContext, messagesToCompact } from '../packages/ai-core/src/memory/context';

const msg = (role: 'user' | 'assistant', content: string) => ({
  role, content, createdAt: new Date(),
});

describe('context builder', () => {
  it('opens with the YARUB ONE identity in the user language', () => {
    const ctx = buildContext({ locale: 'ar', messages: [msg('user', 'مرحبا')] });
    expect(ctx[0].role).toBe('system');
    expect(ctx[0].content).toContain('يعرب ون');
  });

  it('never leaks a vendor name into the system prompt', () => {
    for (const locale of ['ar', 'ur', 'en'] as const) {
      const ctx = buildContext({ locale, messages: [] });
      expect(ctx[0].content).not.toMatch(/gpt|claude|gemini|openai|anthropic/i);
    }
  });

  it('adds explanation guidance in education mode', () => {
    const ctx = buildContext({ locale: 'ur', education: true, messages: [] });
    expect(ctx[0].content).toContain('صرف حتمی جواب نہ دیں');
  });

  it('includes project context when the conversation belongs to one', () => {
    const ctx = buildContext({
      locale: 'en',
      messages: [],
      project: { title: 'Arabic Science Book', domain: 'document', artifacts: ['Chapter 1'] },
    });
    expect(ctx.some((m) => m.content.includes('Arabic Science Book'))).toBe(true);
    expect(ctx.some((m) => m.content.includes('Chapter 1'))).toBe(true);
  });

  it('drops the oldest turns first when over budget', () => {
    const messages = Array.from({ length: 40 }, (_, i) => msg('user', `${i}`.repeat(200)));
    const ctx = buildContext({ locale: 'en', messages, maxChars: 3000 });
    const last = ctx.at(-1)!.content;
    expect(last.startsWith('39')).toBe(true);
  });

  it('keeps recent turns out of the compaction set', () => {
    const messages = Array.from({ length: 20 }, (_, i) => msg('user', `m${i}`));
    const stale = messagesToCompact(messages, 12);
    expect(stale).toHaveLength(8);
    expect(stale.at(-1)!.content).toBe('m7');
  });

  it('compacts nothing for a short conversation', () => {
    expect(messagesToCompact([msg('user', 'hi')], 12)).toHaveLength(0);
  });
});
