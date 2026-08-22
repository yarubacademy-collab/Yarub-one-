import { prisma } from '@yarub/db';
import { loadConfig } from '@yarub/config';
import { S3Storage, ALLOWED_UPLOAD_MIMES, assertAllowedUpload } from '@yarub/storage';
import { AppError } from '@yarub/shared';
import { requireUserId } from '../../../lib/session';
import { enforceRateLimit } from '../../../lib/rate-limit';
import { errorResponse } from '../chat/stream/route';

export const runtime = 'nodejs';

/**
 * File intake for image editing and file context.
 *
 * The declared Content-Type and the filename are both attacker-controlled, so
 * neither is trusted: the type is decided by the file's leading bytes and
 * anything unrecognised is rejected outright.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit(`upload:${userId}`, 30);

    const config = loadConfig();
    const form = await request.formData();
    const file = form.get('file');
    const projectId = form.get('projectId');

    if (!(file instanceof File) || typeof projectId !== 'string') {
      throw new AppError('VALIDATION_FAILED', 'file and projectId required', 'فائل درکار ہے۔');
    }

    // Ownership before any work is done on the bytes.
    const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = assertAllowedUpload(bytes, ALLOWED_UPLOAD_MIMES, config.MAX_UPLOAD_BYTES);

    const storage = new S3Storage({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });

    const key = `projects/${projectId}/uploads/${crypto.randomUUID()}`;
    await storage.put(key, bytes, mime);

    const asset = await prisma.asset.create({
      data: {
        projectId,
        kind: mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : 'file',
        storageKey: key,
        mime,
        bytes: bytes.byteLength,
      },
    });

    return Response.json({ assetId: asset.id, mime, bytes: bytes.byteLength });
  } catch (error) {
    return errorResponse(error);
  }
}
