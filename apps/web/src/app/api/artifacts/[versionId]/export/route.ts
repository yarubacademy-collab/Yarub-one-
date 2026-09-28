import JSZip from 'jszip';
import { prisma } from '@yarub/db';
import { loadConfig } from '@yarub/config';
import { S3Storage } from '@yarub/storage';
import { normalizePath } from '@yarub/sandbox';
import { requireUserId } from '../../../../../lib/session';
import { enforceRateLimit } from '../../../../../lib/rate-limit';
import { errorResponse } from '../../../chat/stream/route';

export const runtime = 'nodejs';

/**
 * Artifact export.
 *
 * The user owns what YARUB ONE makes for them, so every artifact leaves as a
 * plain zip of real files that runs anywhere — no lock-in, no proprietary
 * container. Paths are re-validated on the way out: a stored bundle is still
 * generated content, and one traversal check at write time is not a reason to
 * skip one at read time.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit(`export:${userId}`, 20);

    const { versionId } = await params;

    const version = await prisma.artifactVersion.findFirst({
      where: { id: versionId, artifact: { project: { userId } } },
      include: { artifact: true },
    });
    if (!version) {
      return Response.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
    }

    const config = loadConfig();
    const storage = new S3Storage({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });

    const meta = (version.meta ?? {}) as { files?: string[]; contents?: Record<string, string> };
    const files = meta.files ?? ['index.html'];

    // Files made without a storage service are kept inside the version record
    // itself; anything else is read from object storage as before.
    const readFile = async (rawPath: string) => {
      const path = normalizePath(rawPath);
      const kept = meta.contents?.[rawPath];
      const bytes =
        kept !== undefined
          ? new TextEncoder().encode(kept)
          : await storage.get(`${version.storageKey}/${path}`);
      return { path, bytes };
    };

    // A single file, which is the usual case for a website or a game, is handed
    // over as itself: one tap, one file, rather than a zip a phone must unpack.
    // `?format=zip` still asks for the archive.
    const wantsZip = new URL(request.url).searchParams.get('format') === 'zip';
    if (files.length === 1 && !wantsZip) {
      const { path, bytes } = await readFile(files[0]!);
      const ext = (path.split('.').pop() ?? '').toLowerCase();
      const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'txt';

      await prisma.auditLog.create({
        data: { userId, action: 'artifact.export', target: versionId },
      });

      return new Response(toBody(bytes), {
        headers: {
          'Content-Type': MIME_BY_EXT[safeExt] ?? 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${safeFilename(version.artifact.title)}-v${version.version}.${safeExt}"`,
          'X-Content-Type-Options': 'nosniff',
          // It is a download, never a page; if anything did render it, it would
          // still have no access to this site.
          'Content-Security-Policy': "sandbox; default-src 'none'",
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const zip = new JSZip();
    for (const rawPath of files) {
      const { path, bytes } = await readFile(rawPath);
      zip.file(path, bytes);
    }

    const archive = await zip.generateAsync({ type: 'uint8array' });
    await prisma.auditLog.create({
      data: { userId, action: 'artifact.export', target: versionId },
    });

    return new Response(toBody(archive), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeFilename(version.artifact.title)}-v${version.version}.zip"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

const MIME_BY_EXT: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  svg: 'image/svg+xml',
};

/**
 * Arabic and Urdu titles are normal here, but they break naive Content-
 * Disposition headers, so the ASCII fallback keeps the download working.
 */
function safeFilename(title: string): string {
  const ascii = title.replace(/[^\w\d-]+/g, '-').replace(/^-+|-+$/g, '');
  return ascii.length >= 3 ? ascii.slice(0, 60) : 'yarub-artifact';
}

/**
 * A Uint8Array may be backed by a SharedArrayBuffer, which BodyInit rejects.
 * Copying into a fresh ArrayBuffer satisfies the contract exactly and avoids
 * handing a shared buffer to the HTTP layer.
 */
function toBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
