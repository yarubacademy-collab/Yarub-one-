import { z } from 'zod';
import { prisma } from '@yarub/db';
import { requireAdmin } from '../../../../lib/admin';
import { errorResponse } from '../../chat/stream/route';

export const runtime = 'nodejs';

const courseSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  price: z.string().min(1).max(100),
  schedule: z.string().max(300).optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  active: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireAdmin();
    const courses = await prisma.course.findMany({ orderBy: { createdAt: 'desc' } });
    return Response.json({ courses });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = courseSchema.parse(await request.json());
    const course = await prisma.course.create({
      data: { ...body, imageUrl: body.imageUrl || null, schedule: body.schedule || null },
    });
    return Response.json({ course });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    const body = courseSchema.extend({ id: z.string() }).parse(await request.json());
    const { id, ...rest } = body;
    const course = await prisma.course.update({
      where: { id },
      data: { ...rest, imageUrl: rest.imageUrl || null, schedule: rest.schedule || null },
    });
    return Response.json({ course });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ code: 'BAD_REQUEST', message: 'id required' }, { status: 400 });
    await prisma.course.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
