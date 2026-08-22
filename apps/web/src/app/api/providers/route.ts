import { z } from 'zod';
import { CAPABILITIES } from '@yarub/shared';
import { loadConfig } from '@yarub/config';
import { listCredentialViews, saveCredentials } from '@yarub/providers';
import { prisma } from '@yarub/db';
import { requireUserId } from '../../../lib/session';
import { enforceRateLimit } from '../../../lib/rate-limit';
import { errorResponse } from '../chat/stream/route';

export const runtime = 'nodejs';

const saveSchema = z.object({
  providerId: z.string().min(1).max(60),
  capability: z.enum(CAPABILITIES),
  tier: z.enum(['fast', 'balanced', 'quality']).default('balanced'),
  baseUrl: z.string().url().optional(),
  model: z.string().max(120).optional(),
  sttModel: z.string().max(120).optional(),
  // Omitted means "leave the stored key alone", which is how the UI can save
  // a URL or model change without the browser ever holding the key.
  apiKey: z.string().min(8).max(400).optional(),
  enabled: z.boolean().default(true),
  costWeight: z.number().int().min(1).max(1000).default(10),
});

export async function GET() {
  try {
    await requireUserId();
    const views = await listCredentialViews(loadConfig());
    // Only masked hints cross this boundary. Never a decrypted key.
    return Response.json({ providers: views });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit(`providers:${userId}`, 20);

    const body = saveSchema.parse(await request.json());

    await saveCredentials(loadConfig(), {
      providerId: body.providerId,
      capability: body.capability,
      tier: body.tier,
      enabled: body.enabled,
      costWeight: body.costWeight,
      ...(body.baseUrl !== undefined ? { baseUrl: body.baseUrl } : {}),
      ...(body.model !== undefined ? { model: body.model } : {}),
      ...(body.sttModel !== undefined ? { sttModel: body.sttModel } : {}),
      ...(body.apiKey !== undefined ? { apiKey: body.apiKey } : {}),
    });

    // Credential changes are exactly the events an operator needs a trail of.
    await prisma.auditLog.create({
      data: {
        userId,
        action: body.apiKey ? 'provider.credential.set' : 'provider.config.update',
        target: `${body.capability}:${body.providerId}`,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
