/**
 * Decides which of a course's four reminder stages are due, given the
 * current time and which stages have already been sent. Kept separate from
 * the route (and from Prisma, and from sending email) so the actual
 * scheduling decision — the part worth being certain about — can be tested
 * directly, with nothing real running.
 */

export type ReminderStage = 'day_before' | 'hours_before' | 'hour_before' | 'starting';

/** Earliest first: a course due for 'starting' is also due for every stage before it. */
export const STAGE_OFFSETS_MS: Record<ReminderStage, number> = {
  day_before: 24 * 3_600_000,
  hours_before: 3 * 3_600_000,
  hour_before: 1 * 3_600_000,
  starting: 0,
};

const STAGE_ORDER: ReminderStage[] = ['day_before', 'hours_before', 'hour_before', 'starting'];

/**
 * A stage is due once "now" has reached startsAt minus its offset, and it
 * has not been sent before. All such stages are returned, oldest first, so
 * that a course no one checked on in time (added an hour before it starts, or
 * a cron tick that was missed) still gets whichever reminders make sense
 * right now, in order, instead of none at all.
 *
 * A course that started too long ago is left alone — `maxLatenessMs` (default
 * 6 hours) bounds how far past its own start time a course is still worth
 * messaging people about at all.
 */
export function dueStages(input: {
  startsAt: Date;
  now: Date;
  alreadySent: ReadonlySet<ReminderStage>;
  maxLatenessMs?: number;
}): ReminderStage[] {
  const { startsAt, now, alreadySent, maxLatenessMs = 6 * 3_600_000 } = input;

  if (now.getTime() > startsAt.getTime() + maxLatenessMs) return [];

  return STAGE_ORDER.filter((stage) => {
    if (alreadySent.has(stage)) return false;
    const dueAt = startsAt.getTime() - STAGE_OFFSETS_MS[stage];
    return now.getTime() >= dueAt;
  });
}

export const STAGE_LABEL_AR: Record<ReminderStage, string> = {
  day_before: 'غدًا',
  hours_before: 'خلال 3 ساعات',
  hour_before: 'خلال ساعة',
  starting: 'الآن',
};
