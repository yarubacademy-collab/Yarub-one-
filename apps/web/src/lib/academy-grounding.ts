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
  return parts.join('\n');
}

/**
 * Builds the grounding text for one chat message, and names the single best
 * course image to show alongside the answer, if any matched course has one.
 * Returns null context when there is nothing to add, so a request with no
 * academy data configured yet behaves exactly as before this feature existed.
 */
export async function buildAcademyGrounding(
  message: string,
): Promise<{ context: string | null; imageUrl: string | null; whatsappUrl: string | null }> {
  const [info, courses] = await Promise.all([
    prisma.academyInfo.findUnique({ where: { id: 'main' } }),
    prisma.course.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        schedule: true,
        imageUrl: true,
        whatsappNumber: true,
      },
    }),
  ]);

  const matches = findMatchingCourses(message, courses);
  const sections: string[] = [];
  if (info?.content) sections.push(`ACADEMY INFORMATION:\n${info.content}`);
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
