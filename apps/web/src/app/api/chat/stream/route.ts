import { z } from 'zod';
import { LOCALES, AppError } from '@yarub/shared';
import { prisma } from '@yarub/db';
import { core } from '../../../../lib/core';
import { requireUserId } from '../../../../lib/session';
import { enforceRateLimit } from '../../../../lib/rate-limit';
import { toHttpResponse } from '../../../../lib/logger';
import { needsLiveInfo, webSearch } from '../../../../lib/web-search';

export const runtime = 'nodejs';

const bodySchema = z.object({
  message: z.string().min(1).max(24_000),
  locale: z.enum(LOCALES),
  conversationId: z.string().optional(),
  projectId: z.string().optional(),
});

/**
 * The single entry point for conversational input.
 *
 * The Core decides what happens: answer directly, ask one clarifying question,
 * or turn the request into a project. The client does not choose a mode, which
 * is what lets a user simply describe what they want.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit(`chat:${userId}`, 30);

    const body = bodySchema.parse(await request.json());

    let history: Array<{ role: 'user' | 'assistant'; content: string; createdAt: Date }> = [];
    if (body.conversationId) {
      const rows = await prisma.message.findMany({
        where: { conversationId: body.conversationId, conversation: { project: { userId } } },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      history = rows.map((r: { role: string; content: string; createdAt: Date }) => ({
        role: r.role === 'assistant' ? 'assistant' : 'user',
        content: r.content,
        createdAt: r.createdAt,
      }));
    }

    const decision = await core().decide({
      rawRequest: body.message,
      locale: body.locale,
      history,
    });

    if (decision.kind === 'clarify') {
      return Response.json({
        kind: 'clarify',
        question: decision.question[body.locale],
      });
    }

    if (decision.kind === 'project') {
      return Response.json({
        kind: 'project',
        plan: {
          title: decision.plan.title[body.locale],
          steps: decision.plan.steps.map((s) => ({
            id: s.id,
            title: s.title[body.locale],
            capability: s.capability,
          })),
        },
      });
    }

    // Time-sensitive questions (weather, "today", prices, scores...) need
    // information no model can know on its own. When a search key is
    // configured, look it up and hand the model fresh context to answer
    // from; when it is not, or the lookup fails, the model answers exactly
    // as it always did, honestly, without inventing a live fact.
    if (needsLiveInfo(body.message)) {
      const liveInfo = await webSearch(body.message);
      if (liveInfo) {
        decision.messages.splice(1, 0, {
          role: 'system',
          content: `Live web search results for the user's question. Use them if relevant, and mention that the information comes from a live search:\n\n${liveInfo}`,
        });
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let full = '';
        try {
          for await (const chunk of core().streamAnswer(decision)) {
            if (chunk.delta) {
              full += chunk.delta;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`),
              );
            }
            if (chunk.done) break;
          }

          if (body.conversationId) {
            await prisma.message.createMany({
              data: [
                { conversationId: body.conversationId, role: 'user', content: body.message },
                { conversationId: body.conversationId, role: 'assistant', content: full },
              ],
            });
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          const safe = error instanceof AppError ? error.toPublic() : { code: 'INTERNAL', message: 'Error' };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: safe })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export function errorResponse(error: unknown): Response {
  // Delegates to the logger so every failure gets a correlation id and a
  // server-side record, while the browser still receives only a safe message.
  return toHttpResponse(error);
}
