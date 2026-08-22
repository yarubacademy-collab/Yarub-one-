import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { loadConfig } from '@yarub/config';
import { prisma } from '@yarub/db';
import { S3Storage } from '@yarub/storage';
import { normalizePath, previewHeaders } from '@yarub/sandbox';

/**
 * The preview origin.
 *
 * This is a separate process on a separate host for one reason: generated code
 * must never share an origin with the application. Running here, it has no
 * access to the session cookie, no access to the API, and — thanks to the CSP —
 * no outbound network at all.
 *
 * This server is deliberately tiny. It authenticates nothing and executes
 * nothing; it only streams stored bytes with locked-down headers.
 */
const config = loadConfig();
const storage = new S3Storage({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  bucket: config.S3_BUCKET,
  accessKeyId: config.S3_ACCESS_KEY_ID,
  secretAccessKey: config.S3_SECRET_ACCESS_KEY,
});

const app = new Hono();

app.get('/p/:token/*', async (c) => {
  const token = c.req.param('token');

  // The token is an unguessable artifact-version id. Nothing else identifies
  // the viewer, because this origin must never hold user identity.
  const version = await prisma.artifactVersion.findUnique({
    where: { id: token },
    include: { artifact: true },
  });
  if (!version) return c.text('Not found', 404);

  const requested = c.req.path.split(`/p/${token}/`)[1] || 'index.html';

  let path: string;
  try {
    path = normalizePath(requested);
  } catch {
    return c.text('Forbidden', 403);
  }

  try {
    const bytes = await storage.get(`${version.storageKey}/${path}`);
    const mime = path.endsWith('.css') ? 'text/css'
      : path.endsWith('.js') ? 'text/javascript'
      : path.endsWith('.json') ? 'application/json'
      : path.endsWith('.svg') ? 'image/svg+xml'
      : 'text/html; charset=utf-8';

    return new Response(bytes, {
      headers: { ...previewHeaders(), 'Content-Type': mime },
    });
  } catch {
    return c.text('Not found', 404);
  }
});

app.get('/health', (c) => c.json({ ok: true }));

const port = Number(new URL(config.PREVIEW_ORIGIN).port || 3001);
serve({ fetch: app.fetch, port });
console.log(`YARUB ONE preview origin on :${port}`);
