import { prisma } from '@yarub/db';
import { dueStages, STAGE_LABEL_AR, type ReminderStage } from '../../../../lib/course-reminders';
import { sendAnnouncementEmail } from '../../../../lib/mailer';
import { buildWhatsAppJoinLink } from '../../../../lib/whatsapp-join';
import { escapeHtml } from '../../../../lib/html-escape';

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

// course.name and course.price are admin-entered, free-text fields — nothing
// stops an admin from typing a "&", a quote, or a stray "<" into a course
// name. Escaped before going into this HTML, so a name like "Mother & Child
// Care" renders as that literal text instead of silently breaking the markup.
function emailHtml(
  courseName: string,
  price: string,
  stage: ReminderStage,
  whatsappNumber: string | null,
): string {
  const joinLink = buildWhatsAppJoinLink(courseName, whatsappNumber);
  const when = STAGE_LABEL_AR[stage];
  const safeName = escapeHtml(courseName);
  const safePrice = escapeHtml(price);

  return `
    <div dir="rtl" style="font-family: sans-serif; font-size: 16px; line-height: 1.8;">
      <p>السلام عليكم،</p>
      <p>دورة <strong>"${safeName}"</strong> تبدأ ${when}.</p>
      <p>السعر: <strong>${safePrice}</strong></p>
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

  const results: Array<{ courseId: string; stage: ReminderStage; sent: boolean; reason?: string }> = [];

  for (const course of courses) {
    if (!course.startsAt) continue;

    const alreadySent = new Set(course.reminders.map((r) => r.stage as ReminderStage));
    const stages = dueStages({ startsAt: course.startsAt, now, alreadySent });

    for (const stage of stages) {
      // Claimed before sending, not after: the unique index on
      // [courseId, stage] means only one concurrent request can ever win this
      // insert. Two overlapping triggers of this route (the schedule firing
      // at the same moment as a manual check, say) both pass the dueStages
      // check above from the same starting state, but only the winner here
      // actually emails anyone — the loser sees its own insert rejected and
      // moves on, rather than sending a duplicate and then crashing on a
      // reminder row that already exists.
      try {
        await prisma.courseReminder.create({ data: { courseId: course.id, stage } });
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        if (code === 'P2002') {
          results.push({ courseId: course.id, stage, sent: false, reason: 'already claimed by a concurrent run' });
          continue;
        }
        throw error;
      }

      const outcome = await sendAnnouncementEmail({
        recipients: allEmails,
        subject: `دورة "${course.name}" — ${STAGE_LABEL_AR[stage]}`,
        html: emailHtml(course.name, course.price, stage, course.whatsappNumber),
      });

      // The reason is included right here, not just logged, so a failure can
      // be diagnosed by opening this URL in a browser — no Vercel Logs needed.
      results.push({ courseId: course.id, stage, sent: outcome.sent, ...(outcome.reason ? { reason: outcome.reason } : {}) });
    }
  }

  return Response.json({ checked: courses.length, results });
}
