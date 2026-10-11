import type { DateTime } from '$lib/models/workspace';

/** The process wall clock. Composition passes it down; no service or controller reads the time itself. */
export const systemClock = (): DateTime => new Date().toISOString() as DateTime;
