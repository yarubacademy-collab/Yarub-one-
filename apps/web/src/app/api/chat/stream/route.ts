import { z } from 'zod';
import { LOCALES, AppError } from '@yarub/shared';
import { prisma } from '@yarub/db';
import { core } from '../../../../lib/core';
import { requireUserId } from '../../../../lib/session';
import { enforceRateLimit } from '../../../../lib/rate-limit';
import { toHttpResponse } from '../../../../lib/logger';
import { needsLiveInfo, webSearch } from '../../../../lib/web-search';
import { buildAcademyGrounding } from '../../../../lib/academy-grounding';

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
      // Reading is scoped to the owner in the query, but the write at the end of
      // this request is not, so ownership is settled once, up front, for both.
      const owned = await prisma.conversation.findFirst({
        where: { id: body.conversationId, project: { userId } },
        select: { id: true },
      });
      if (!owned) {
        return Response.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
      }

      // The most recent messages, oldest first. Taking the first 100 instead would
      // mean that once a conversation outgrew 100 messages the model saw only its
      // beginning and never what had just been said.
      const rows = await prisma.message.findMany({
        where: { conversationId: body.conversationId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      history = rows.reverse().map((r: { role: string; content: string; createdAt: Date }) => ({
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

    // Academy facts and, when the message matches a configured course, that
    // course's exact price and description. Nothing happens here — same as the
    // web search step above — until the admin console actually has data in it.
    const academy = await buildAcademyGrounding(body.message);
    if (academy.context) {
      decision.messages.splice(1, 0, { role: 'system', content: academy.context });
    }

    const encoder = new TextEncoder();
    // Set when the reader goes away (stop button, closed tab or app). The loop
    // then stops pulling from the provider instead of paying for words nobody reads.
    let readerGone = false;

    const stream = new ReadableStream({
      async start(controller) {
        let full = '';
        let failure: unknown;

        // Sending to a reader that has already left throws; here that is not an error.
        const send = (text: string) => {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            readerGone = true;
          }
        };

        // Sent once, before any text, so the client can show the course's ad
        // image alongside the answer as soon as the answer starts arriving.
        if (academy.imageUrl) {
          send(`data: ${JSON.stringify({ image: academy.imageUrl })}\n\n`);
        }

        try {
          for await (const chunk of core().streamAnswer(decision)) {
            if (readerGone) break;
            if (chunk.delta) {
              full += chunk.delta;
              send(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
            }
            if (chunk.done) break;
          }
        } catch (error) {
          failure = error;
        }

        // Keep whatever was said, including an answer cut short by the stop button,
        // so the thread reads the same after a reload. A failure with nothing said
        // leaves no trace, and the user simply asks again.
        if (body.conversationId && full) {
          try {
            await prisma.message.createMany({
              data: [
                { conversationId: body.conversationId, role: 'user', content: body.message },
                { conversationId: body.conversationId, role: 'assistant', content: full },
              ],
            });
          } catch {
            // A history write failing must not turn a delivered answer into an error.
          }
        }

        if (failure) {
          const safe =
            failure instanceof AppError ? failure.toPublic() : { code: 'INTERNAL', message: 'Error' };
          send(`data: ${JSON.stringify({ error: safe })}\n\n`);
        } else {
          send('data: [DONE]\n\n');
        }

        try {
          controller.close();
        } catch {
          // Already closed by the reader leaving.
        }
      },
      cancel() {
        readerGone = true;
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
