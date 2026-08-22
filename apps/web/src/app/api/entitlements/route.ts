import { requireUserId } from '../../../lib/session';
import { resolveEntitlements } from '../../../lib/entitlements';
import { errorResponse } from '../chat/stream/route';

export const runtime = 'nodejs';

/**
 * The allowance the UI displays.
 *
 * Computed server-side and sent read-only. The client renders these numbers
 * but never supplies them — enforcement happens again on every request.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const entitlements = await resolveEntitlements(userId);

    return Response.json({
      planCode: entitlements.planCode,
      allowance: entitlements.allowance,
      maxVideoSeconds: entitlements.limits.maxVideoSeconds,
      periodEnds: entitlements.period.end,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
