import { z } from 'zod';
import { requireAdmin } from '../../../../lib/admin';
import { errorResponse } from '../../chat/stream/route';

export const runtime = 'nodejs';

/**
 * Turns an admin-uploaded image into a public URL, with no storage account of
 * any kind — it commits the file straight into this GitHub repo's own
 * apps/web/public/ folder, the same place a course logo has been placed by
 * hand earlier, and hands back the resulting raw.githubusercontent.com link.
 * That works because this repo is already public, so anything in public/ is
 * already served to the world for free.
 *
 * Requires GITHUB_TOKEN (a classic personal access token with just the
 * "repo" scope, from https://github.com/settings/tokens) and GITHUB_REPO
 * ("owner/name", e.g. "yarubacademy-collab/Yarub-one-") as environment
 * variables. Without them this returns NOT_CONFIGURED rather than failing
 * strangely, the same pattern every other optional integration in this app
 * follows.
 */

const schema = z.object({
  filename: z.string().min(1).max(100),
  /** data: URL or bare base64 — either is accepted. */
  dataUrl: z.string().min(1),
});

function safeFilename(name: string): string {
  // Only the part after the LAST dot is ever treated as an extension, and
  // only when it's a plausible one (1-5 letters) — a path with no real
  // extension (or one engineered to smuggle a path, like "../../etc/passwd")
  // just falls back to .jpg rather than carrying anything from `name`
  // through to the path used below.
  const last = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  const candidate = last.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ext = candidate.length >= 1 && candidate.length <= 5 ? candidate : 'jpg';
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `course-${stamp}-${random}.${ext}`;
}

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    if (!token || !repo) {
      return Response.json({ code: 'NOT_CONFIGURED', message: 'GITHUB_TOKEN/GITHUB_REPO not set' }, { status: 503 });
    }

    const body = schema.parse(await request.json());
    const base64 = body.dataUrl.includes(',') ? body.dataUrl.split(',')[1]! : body.dataUrl;
    if (base64.length > 7_000_000) {
      // ~5 MB of real bytes once base64's ~33% overhead is accounted for —
      // generous for a course photo, small enough GitHub's API accepts it in
      // one request rather than needing the multi-step large-file flow.
      return Response.json({ code: 'TOO_LARGE', message: 'Image is too large (max ~5MB)' }, { status: 413 });
    }

    const path = `apps/web/public/${safeFilename(body.filename)}`;

    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Add course image ${path}`,
        content: base64,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[upload-image] GitHub API error', res.status, detail.slice(0, 300));
      return Response.json({ code: 'UPLOAD_FAILED', message: 'Could not upload the image' }, { status: 502 });
    }

    return Response.json({ url: `https://raw.githubusercontent.com/${repo}/main/${path}` });
  } catch (error) {
    return errorResponse(error);
  }
}
