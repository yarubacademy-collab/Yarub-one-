import { prisma } from '@yarub/db';
import { buildWhatsAppJoinLink } from './whatsapp-join';

/**
 * Keeps chat answers about the academy grounded in real data instead of the
 * model's own guesses — the same approach used for Be My Chef's recipes.
 *
 * AcademyInfo (one free-text row: intro, departments, the yarub-library
 * reference collection, policies) is small enough to send on every single
 * request. Course rows are not — with many courses, sending all of them every
 * time would bloat and slow down every single message, most of which are not
 * about a course at all. So courses are matched by name against the message
 * first, and only the matches are sent.
 */

export interface CourseMatch {
  id: string;
  name: string;
  description: string;
  price: string;
  schedule: string | null;
  startsAt: Date | null;
  imageUrl: string | null;
  whatsappNumber: string | null;
}

const MAX_MATCHES = 3;

function findMatchingCourses(message: string, courses: CourseMatch[]): CourseMatch[] {
  const text = message.toLowerCase();

  return courses
    .map((course) => {
      const name = course.name.toLowerCase();
      let score = 0;
      if (text.includes(name)) score += 10;
      for (const word of name.split(/[\s\-,()]+/)) {
        if (word.length >= 3 && text.includes(word)) score += 3;
      }
      return { course, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHES)
    .map((x) => x.course);
}

function formatCourse(course: CourseMatch): string {
  const parts = [
    `Course: ${course.name}`,
    `Description: ${course.description}`,
    `Price: ${course.price}`,
  ];
  if (course.schedule) parts.push(`Schedule: ${course.schedule}`);
  if (course.startsAt) parts.push(`Starts: ${course.startsAt.toISOString()}`);
  return parts.join('\n');
}

/**
 * One line per course: just enough for "what courses do you have this month"
 * or "is there a Qur'an course coming up" to be answerable without a specific
 * course being named first. Kept to name/price/schedule (no description) so
 * even a few dozen active courses stay a short, cheap addition to every
 * single chat message — unlike the full RELEVANT COURSES section below,
 * which is sent only for the one or few courses a message actually names.
 */
function formatCourseSummaryLine(course: CourseMatch): string {
  const when = course.schedule ?? (course.startsAt ? course.startsAt.toISOString() : null);
  return `- ${course.name} — ${course.price}${when ? ` — ${when}` : ''}`;
}

/**
 * Builds the grounding text for one chat message, and names the single best
 * course image to show alongside the answer, if any matched course has one.
 * Returns null context when there is nothing to add, so a request with no
 * academy data configured yet behaves exactly as before this feature existed.
 */
const NOTHING = { context: null, imageUrl: null, whatsappUrl: null } as const;

export async function buildAcademyGrounding(
  message: string,
): Promise<{ context: string | null; imageUrl: string | null; whatsappUrl: string | null }> {
  // A chat message must always get an answer. This feature enriches that
  // answer with academy facts when it can, but it must never be the reason
  // chat itself goes silent — e.g. if a deploy's database migration hasn't
  // finished yet and these two tables don't exist for a few minutes. Any
  // failure here is treated exactly like "nothing configured yet".
  let info: { content: string } | null;
  let courses: CourseMatch[];
  try {
    [info, courses] = await Promise.all([
      prisma.academyInfo.findUnique({ where: { id: 'main' } }),
      prisma.course.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          schedule: true,
          startsAt: true,
          imageUrl: true,
          whatsappNumber: true,
        },
      }),
    ]);
  } catch (error) {
    console.error('[academy-grounding] unavailable, answering without it', error instanceof Error ? error.message : error);
    return NOTHING;
  }

  const matches = findMatchingCourses(message, courses);
  const sections: string[] = [];
  if (info?.content) sections.push(`ACADEMY INFORMATION:\n${info.content}`);
  // Always included, independent of whether the message names a specific
  // course: this is what lets "what courses are there this month?" or "is
  // there a Qur'an course coming up?" be answered at all, rather than only
  // ever-more-specific follow-ups once a name has already come up.
  if (courses.length) {
    sections.push(`ALL CURRENT COURSES (use this list for any general question about what's offered; do not invent others):\n${courses.map(formatCourseSummaryLine).join('\n')}`);
  }
  if (matches.length) {
    sections.push(`RELEVANT COURSES (use these exact details; do not invent others):\n\n${matches.map(formatCourse).join('\n\n')}`);
  }

  if (!sections.length) return { context: null, imageUrl: null, whatsappUrl: null };

  // The join link names the single best-matched course — joining "the course
  // you just asked about" only makes sense once one specific course has
  // actually come up, not for a general question about the academy.
  const whatsappUrl = matches[0]
    ? buildWhatsAppJoinLink(matches[0].name, matches[0].whatsappNumber)
    : null;

  return {
    context: sections.join('\n\n'),
    imageUrl: matches.find((c) => c.imageUrl)?.imageUrl ?? null,
    whatsappUrl,
  };
}
