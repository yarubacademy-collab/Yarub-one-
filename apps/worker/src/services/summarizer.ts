import { prisma } from '@yarub/db';
import { messagesToCompact, systemPrompt } from '@yarub/ai-core';
import type { CapabilityRouter } from '@yarub/ai-core';
import type { TextProvider } from '@yarub/providers';
import type { Locale } from '@yarub/shared';

/**
 * Rolling conversation summarisation.
 *
 * A long thread eventually exceeds any context window. Truncating alone loses
 * the thread; summarising alone is expensive. So: recent turns stay verbatim,
 * older ones fold into a running summary that costs one call per compaction
 * rather than one per message.
 */

const KEEP_RECENT = 12;

const INSTRUCTION: Record<Locale, string> = {
  ar: `لخّص المحادثة التالية في فقرة واحدة موجزة.
احتفظ بالقرارات، والتفضيلات، والأسماء، والأرقام، والمهام غير المكتملة.
اكتب بصيغة الغائب. لا تضف معلومات غير موجودة.`,
  ur: `درج ذیل گفتگو کا ایک مختصر پیراگراف میں خلاصہ لکھیں۔
فیصلے، ترجیحات، نام، اعداد اور نامکمل کام برقرار رکھیں۔
غائب کے صیغے میں لکھیں۔ کوئی نئی بات شامل نہ کریں۔`,
  en: `Summarise the following conversation in one short paragraph.
Preserve decisions, preferences, names, numbers and unfinished tasks.
Write in the third person. Add nothing that is not present.`,
};

export async function compactConversation(
  conversationId: string,
  router: CapabilityRouter,
): Promise<{ compacted: number } | undefined> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      project: { select: { language: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!conversation) return undefined;

  const stale = messagesToCompact(
    conversation.messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
      createdAt: m.createdAt,
    })),
    KEEP_RECENT,
  );

  if (stale.length === 0) return { compacted: 0 };

  const language = conversation.project.language as Locale;
  const resolved = await router.route<TextProvider>('text.generate', language);
  // No text provider means no summary. The conversation keeps working with
  // plain truncation rather than the job failing or inventing a summary.
  if (!resolved.ok) return undefined;

  const existing = conversation.messages.find((m) => m.role === 'system');

  const res = await resolved.value.generate({
    messages: [
      { role: 'system', content: `${systemPrompt(language)}\n\n${INSTRUCTION[language]}` },
      {
        role: 'user',
        content: [
          existing ? `Previous summary: ${existing.content}` : '',
          ...stale.map((m) => `${m.role}: ${m.content}`),
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    language,
    temperature: 0.2,
    maxOutputTokens: 700,
  });

  // Replace the old summary and the messages it now covers in one transaction,
  // so a crash mid-way cannot drop history without having stored its summary.
  await prisma.$transaction([
    ...(existing ? [prisma.message.delete({ where: { id: existing.id } })] : []),
    prisma.message.deleteMany({
      where: { id: { in: conversation.messages.slice(0, stale.length).map((m) => m.id) } },
    }),
    prisma.message.create({
      data: { conversationId, role: 'system', content: res.text, tokens: res.usage.outputTokens },
    }),
  ]);

  return { compacted: stale.length };
}
