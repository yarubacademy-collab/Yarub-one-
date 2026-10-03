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
  /// The real start time, for the reminder step to schedule against later.
  /// Optional — a blank value here just means no reminder is ever sent for
  /// this course, nothing else about it changes.
  startsAt: z.string().datetime().optional().or(z.literal('')),
  imageUrl: z.string().url().optional().or(z.literal('')),
  /// Which WhatsApp number this course's "Join" button messages. Digits only,
  /// international format, no "+". Blank means ACADEMY_WHATSAPP_NUMBER is
  /// used instead — set this only when a course needs a different person to
  /// receive it (e.g. a Qur'an course going to someone else than an AI course).
  whatsappNumber: z.string().max(20).optional().or(z.literal('')),
  active: z.boolean().default(true),
});

/** A list of courses in one request, for adding several at once. */
const bulkSchema = z.object({ courses: z.array(courseSchema).min(1).max(50) });

export async function GET() {
  try {
    await requireAdmin();
    const courses = await prisma.course.findMany({ orderBy: { createdAt: 'desc' } });
    return Response.json({ courses });
  } catch (error) {
    return errorResponse(error);
  }
}

/** One course, keeping the body of a single create() in one place. */
function toCreateData(body: z.infer<typeof courseSchema>) {
  return {
    ...body,
    imageUrl: body.imageUrl || null,
    schedule: body.schedule || null,
    whatsappNumber: body.whatsappNumber || null,
    startsAt: body.startsAt ? new Date(body.startsAt) : null,
  };
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const json = await request.json();

    // A plain object is one course; { courses: [...] } is several at once —
    // the admin console's "add a few courses in one go" case.
    if (json && typeof json === 'object' && Array.isArray((json as { courses?: unknown }).courses)) {
      const { courses: drafts } = bulkSchema.parse(json);
      const courses = await prisma.$transaction(
        drafts.map((draft) => prisma.course.create({ data: toCreateData(draft) })),
      );
      return Response.json({ courses });
    }

    const body = courseSchema.parse(json);
    const course = await prisma.course.create({ data: toCreateData(body) });
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
    const course = await prisma.course.update({ where: { id }, data: toCreateData(rest) });
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
