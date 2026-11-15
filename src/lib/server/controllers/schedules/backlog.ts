import type { DueSchedule } from '$lib/models/schedules';
import type { ScheduleBacklog } from '$lib/server/services/schedules/runs';

/**
 * The schedules the worker must run now. The worker acts for each schedule's owner, so it hands
 * every listed schedule to that owner's agent harness.
 */
export interface ScheduleBacklogController {
	due(): Promise<readonly DueSchedule[]>;
}

export class ScheduleBacklogReader implements ScheduleBacklogController {
	constructor(private readonly backlog: ScheduleBacklog) {}

	due(): Promise<readonly DueSchedule[]> {
		return this.backlog.due();
	}
}
