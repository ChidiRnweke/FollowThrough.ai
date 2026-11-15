import { describe, expect, it } from 'vitest';
import type { AgentRunId, AgentRunStatus, ConversationId } from '$lib/models/agent';
import type { DueSchedule, ScheduleOccurrence, ScheduleOccurrenceId } from '$lib/models/schedules';
import type { DateTime } from '$lib/models/workspace';
import type { ScheduleBacklogRepository } from '$lib/server/repositories/schedules';
import { InMemoryScheduleOccurrenceRepository } from '$lib/testing/schedules/fakes/in-memory-schedules';
import { testScheduleId, tuesdayRun } from '$lib/testing/schedules/fixtures/schedules';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { ScheduleBacklogService, ScheduleRuns } from './runs';

const runId = '32000000-0000-4000-8000-000000000001' as AgentRunId;
const occurrence: ScheduleOccurrence = {
	id: '5d000000-0000-4000-8000-000000000001' as ScheduleOccurrenceId,
	userId: testActor().userId,
	scheduleId: testScheduleId(),
	trigger: 'recurrence',
	scheduledFor: tuesdayRun,
	conversationId: '33000000-0000-4000-8000-000000000001' as ConversationId,
	runId,
	createdAt: '2026-11-17T07:00:20.000Z' as DateTime
};

describe('a schedule’s runs', () => {
	it('has a waiting run only while a recorded run of that schedule is parked for approval', async () => {
		const status: { current: AgentRunStatus } = { current: 'running' };
		const runs = new ScheduleRuns(
			new InMemoryScheduleOccurrenceRepository((id) => (id === runId ? status.current : undefined))
		);
		const before = await runs.hasWaitingRun(testScheduleId());
		await runs.record(occurrence);
		const running = await runs.hasWaitingRun(testScheduleId());
		status.current = 'awaiting_approval';

		expect([
			before,
			running,
			await runs.hasWaitingRun(testScheduleId()),
			await runs.hasWaitingRun(testScheduleId(2))
		]).toEqual([false, false, true, false]);
	});
});

class ClockedBacklog implements ScheduleBacklogRepository {
	async listDue(now: DateTime): Promise<readonly DueSchedule[]> {
		return now >= tuesdayRun ? [{ owner: testActor(), scheduleId: testScheduleId() }] : [];
	}
}

describe('the schedules the worker must run', () => {
	it('are those due at the moment the worker asks', async () => {
		const clock = { now: '2026-11-17T06:59:50.000Z' as DateTime };
		const backlog = new ScheduleBacklogService(new ClockedBacklog(), () => clock.now);
		const early = await backlog.due();
		clock.now = '2026-11-17T07:00:20.000Z' as DateTime;

		expect([early, await backlog.due()]).toEqual([
			[],
			[{ owner: testActor(), scheduleId: testScheduleId() }]
		]);
	});
});
