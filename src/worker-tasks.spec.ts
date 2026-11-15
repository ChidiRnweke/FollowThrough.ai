import { describe, expect, it } from 'vitest';
import type { ActorContext } from '$lib/models/identity';
import type { DueSchedule, ScheduleId, ScheduleRunStart } from '$lib/models/schedules';
import { testScheduleId } from '$lib/testing/schedules/fixtures/schedules';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { dueSchedules, type TaskLogger } from './worker-tasks';

describe('the worker tick for due schedules', () => {
	it('starts each due schedule as its owner, and one that fails does not stop the rest', async () => {
		const due: readonly DueSchedule[] = [
			{ owner: testActor(1), scheduleId: testScheduleId(1) },
			{ owner: testActor(2), scheduleId: testScheduleId(2) },
			{ owner: testActor(3), scheduleId: testScheduleId(3) }
		];
		const started: { readonly owner: ActorContext; readonly scheduleId: ScheduleId }[] = [];
		const reported: string[] = [];
		const logger: TaskLogger = {
			error: (message) => reported.push(message),
			log: () => undefined
		};
		const task = dueSchedules(
			{
				backlog: () => ({ due: async () => due }),
				harnessFor: (owner) => ({
					runDueSchedule: async (scheduleId): Promise<ScheduleRunStart> => {
						if (scheduleId === testScheduleId(2))
							throw new Error('The model catalog is unreachable');
						started.push({ owner, scheduleId });
						return { kind: 'not_due' };
					}
				})
			},
			logger
		);

		await task.run();

		expect({ started, reported }).toEqual({
			started: [
				{ owner: testActor(1), scheduleId: testScheduleId(1) },
				{ owner: testActor(3), scheduleId: testScheduleId(3) }
			],
			reported: [`[due-schedules] schedule ${testScheduleId(2)} did not start:`]
		});
	});
});
