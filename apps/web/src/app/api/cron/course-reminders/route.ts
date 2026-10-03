import { prisma } from '@yarub/db';
import { dueStages, STAGE_LABEL_AR, type ReminderStage } from '../../../../lib/course-reminders';
import { sendAnnouncementEmail } from '../../../../lib/mailer';
import { buildWhatsAppJoinLink } from '../../../../lib/whatsapp-join';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Called by Vercel Cron on the schedule in vercel.json (every 15 minutes).
 * For every active course with a real start time, works out which of its
 * four reminder stages are due right now and have not been sent, emails
 * every signed-up user about the ones that are, and records each stage sent
 * so the next run — 15 minutes later — does not send it again.
 *
 * "Every signed-up user" rather than people who showed interest in that
 * particular course, because this is a small academy announcing its own
 * courses to its own student list, not a platform with per-course sign-ups.
 */

function emailHtml(
  courseName: string,
  price: string,
  stage: ReminderStage,
  whatsappNumber: string | null,
): string {
  const joinLink = buildWhatsAppJoinLink(courseName, whatsappNumber);
  const when = STAGE_LABEL_AR[stage];

  return `
    <div dir="rtl" style="font-family: sans-serif; font-size: 16px; line-height: 1.8;">
      <p>السلام عليكم،</p>
      <p>دورة <strong>"${courseName}"</strong> تبدأ ${when}.</p>
      <p>السعر: <strong>${price}</strong></p>
      ${
        joinLink
          ? `<p><a href="${joinLink}" style="display:inline-block;padding:10px 20px;background:#25D366;color:#fff;border-radius:8px;text-decoration:none;">انضم عبر واتساب</a></p>`
          : ''
      }
    </div>
  `;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const now = new Date();

  const courses = await prisma.course.findMany({
    where: { active: true, startsAt: { not: null } },
    include: { reminders: true },
  });

  const recipients = await prisma.user.findMany({ select: { email: true } });
  const allEmails = recipients.map((u) => u.email);

  const results: Array<{ courseId: string; stage: ReminderStage; sent: boolean }> = [];

  for (const course of courses) {
    if (!course.startsAt) continue;

    const alreadySent = new Set(course.reminders.map((r) => r.stage as ReminderStage));
    const stages = dueStages({ startsAt: course.startsAt, now, alreadySent });

    for (const stage of stages) {
      const outcome = await sendAnnouncementEmail({
        recipients: allEmails,
        subject: `دورة "${course.name}" — ${STAGE_LABEL_AR[stage]}`,
        html: emailHtml(course.name, course.price, stage, course.whatsappNumber),
      });

      // Recorded as sent even if the actual email failed (e.g. SMTP not
      // configured yet): without this, a persistently failing send would be
      // retried every 15 minutes forever rather than being visible once and
      // then left for the admin to notice and fix.
      await prisma.courseReminder.create({ data: { courseId: course.id, stage } });

      results.push({ courseId: course.id, stage, sent: outcome.sent });
    }
  }

  return Response.json({ checked: courses.length, results });
}
