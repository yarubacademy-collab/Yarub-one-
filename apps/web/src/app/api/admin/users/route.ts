import { z } from 'zod';
import { prisma } from '@yarub/db';
import { requireAdmin } from '../../../../lib/admin';
import { errorResponse } from '../../chat/stream/route';

export const runtime = 'nodejs';

const patchSchema = z.object({
  userId: z.string(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  grantPlanCode: z.enum(['free', 'premium_monthly', 'premium_yearly']).optional(),
});

export async function GET() {
  try {
    await requireAdmin();

    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        email: true,
        role: true,
        locale: true,
        createdAt: true,
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: { select: { code: true } } },
        },
      },
    });

    return Response.json({
      users: users.map(
        (u: {
          id: string;
          email: string;
          role: string;
          createdAt: Date;
          subscriptions: Array<{ status: string; expiresAt: Date | null; plan: { code: string } }>;
        }) => ({
          id: u.id,
          email: u.email,
          role: u.role,
          createdAt: u.createdAt,
          plan: u.subscriptions[0]?.plan.code ?? 'free',
          status: u.subscriptions[0]?.status ?? 'active',
          expiresAt: u.subscriptions[0]?.expiresAt ?? null,
        }),
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Manual plan grants exist so the owner can comp an account or fix a failed
 * payment without a payment provider being connected. Every grant is audited.
 */
export async function PATCH(request: Request) {
  try {
    const adminId = await requireAdmin();
    const body = patchSchema.parse(await request.json());

    if (body.role) {
      await prisma.user.update({ where: { id: body.userId }, data: { role: body.role } });
      await prisma.auditLog.create({
        data: { userId: adminId, action: `admin.role.${body.role}`, target: body.userId },
      });
    }

    if (body.grantPlanCode) {
      const plan = await prisma.plan.findFirst({ where: { code: body.grantPlanCode } });
      if (!plan) {
        return Response.json({ code: 'NOT_FOUND', message: 'Plan not seeded' }, { status: 404 });
      }

      await prisma.subscription.updateMany({
        where: { userId: body.userId, status: { in: ['active', 'grace'] } },
        data: { status: 'expired' },
      });

      await prisma.subscription.create({
        data: {
          userId: body.userId,
          planId: plan.id,
          status: 'active',
          expiresAt: new Date(Date.now() + plan.intervalDays * 86_400_000),
        },
      });

      await prisma.billingEvent.create({
        data: {
          userId: body.userId,
          type: 'subscription.granted',
          planCode: body.grantPlanCode,
          provider: null,
        },
      });

      await prisma.auditLog.create({
        data: { userId: adminId, action: 'admin.plan.grant', target: body.userId },
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
