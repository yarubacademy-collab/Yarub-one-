import { z } from 'zod';
import { DOMAINS, LOCALES } from '@yarub/shared';

export const intentSchema = z.object({
  domain: z.enum(DOMAINS),
  language: z.enum(LOCALES),
  complexity: z.enum(['simple', 'project']),
  /** Short restatement of the goal, in the user's language. */
  goal: z.string().min(1).max(500),
  entities: z.record(z.string(), z.string()).default({}),
  confidence: z.number().min(0).max(1),
});

export type Intent = z.infer<typeof intentSchema>;

/** Below this the Core asks one clarifying question instead of guessing. */
export const CLARIFY_THRESHOLD = 0.55;
