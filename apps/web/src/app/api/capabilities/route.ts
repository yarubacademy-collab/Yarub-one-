import { CAPABILITIES } from '@yarub/shared';
import { loadConfig } from '@yarub/config';
import { buildRegistryWithOverrides } from '@yarub/providers';
import { requireUserId } from '../../../lib/session';
import { errorResponse } from '../chat/stream/route';

export const runtime = 'nodejs';

/**
 * Powers the Settings matrix and the disabled state of incomplete sections.
 *
 * Returns capability status only — never a provider id, key fragment or
 * endpoint, so the browser learns what YARUB ONE can do without learning
 * anything about how.
 */
export async function GET() {
  try {
    await requireUserId();
    const registry = await buildRegistryWithOverrides(loadConfig());
    const report = await registry.report(CAPABILITIES);
    return Response.json({
      capabilities: report.map((r) => ({ capability: r.capability, status: r.status })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
