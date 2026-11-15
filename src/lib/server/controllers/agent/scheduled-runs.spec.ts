import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DateTime } from '$lib/models/workspace';
import { AgentRunStatusService } from '$lib/services/agent/run-status';
import {
	brussels,
	scheduleBuilder,
	testScheduleId,
	tuesdayRun
} from '$lib/testing/schedules/fixtures/schedules';
import { scheduledRunsFixture } from '$lib/testing/schedules/fixtures/runs';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const runStatus = new AgentRunStatusService();
const afterTuesdayRun = '2026-11-17T07:00:20.000Z' as DateTime;
const wednesdayRun = '2026-11-18T07:00:00.000Z' as DateTime;

const activeFixtures: ReturnType<typeof scheduledRunsFixture>[] = [];
const setup = (...parameters: Parameters<typeof scheduledRunsFixture>) => {
	const fixture = scheduledRunsFixture(...parameters);
	activeFixtures.push(fixture);
	return fixture;
};
afterEach(async () => {
	for (const fixture of activeFixtures.splice(0)) {
		for (const run of fixture.runs.runs) await fixture.controller.cancel(run.id);
		fixture.release();
		await vi.waitFor(() => {
			if (fixture.runs.runs.some((run) => !runStatus.isTerminal(run.status)))
				throw new Error('Run did not settle after fixture cleanup');
		});
	}
});

describe('the run of a schedule whose time has come', () => {
	it('starts one run as the schedule states it, and moves the schedule on', async () => {
		const schedule = scheduleBuilder({ executionMode: 'auto_accept' });
		const fixture = setup([schedule], afterTuesdayRun);

		const start = await fixture.controller.runDueSchedule(schedule.id);
		const again = await fixture.controller.runDueSchedule(schedule.id);

		const [run] = fixture.runs.runs;
		const [conversation] = fixture.conversations.conversations;
		expect({
			started: [start.kind, again.kind],
			runs: fixture.runs.runs.length,
			run: run && {
				userId: run.userId,
				executionMode: run.executionMode,
				prompt: run.kind === 'agent' && run.inputSnapshot.prompt,
				schedule: run.kind === 'agent' && run.inputSnapshot.schedule
			},
			chat: conversation?.title,
			message: fixture.conversations.messages.map((message) => [message.role, message.content]),
			occurrences: fixture.occurrences.occurrences.map((occurrence) => ({
				scheduleId: occurrence.scheduleId,
				trigger: occurrence.trigger,
				scheduledFor: occurrence.scheduledFor,
				runId: occurrence.runId,
				conversationId: occurrence.conversationId
			})),
			schedule: fixture.schedules.rows
		}).toEqual({
			started: ['started', 'not_due'],
			runs: 1,
			run: {
				userId: testActor().userId,
				executionMode: 'auto_accept',
				prompt: schedule.prompt,
				schedule: {
					scheduleId: testScheduleId(),
					title: 'Morning brief',
					scheduledFor: tuesdayRun,
					timeZone: brussels
				}
			},
			chat: 'Morning brief',
			message: [['user', { type: 'text', text: schedule.prompt }]],
			occurrences: [
				{
					scheduleId: testScheduleId(),
					trigger: 'recurrence',
					scheduledFor: tuesdayRun,
					runId: run?.id,
					conversationId: conversation?.id
				}
			],
			schedule: [
				scheduleBuilder({
					executionMode: 'auto_accept',
					status: 'active',
					nextRunAt: wednesdayRun,
					updatedAt: afterTuesdayRun
				})
			]
		});
	});

	it('starts nothing before the schedule is due', async () => {
		const schedule = scheduleBuilder();
		const fixture = setup([schedule], '2026-11-16T20:00:00.000Z' as DateTime);

		const start = await fixture.controller.runDueSchedule(schedule.id);

		expect([start, fixture.runs.runs, fixture.schedules.rows]).toEqual([
			{ kind: 'not_due' },
			[],
			[schedule]
		]);
	});

	it('skips the next occurrence while an earlier run waits for approval', async () => {
		const schedule = scheduleBuilder();
		const fixture = setup([schedule], afterTuesdayRun, 'approval');
		await fixture.controller.runDueSchedule(schedule.id);
		await vi.waitFor(() => {
			if (fixture.runs.runs[0]?.status !== 'awaiting_approval')
				throw new Error('The first run has not parked for approval');
		});
		fixture.clock.now = '2026-11-18T07:00:20.000Z' as DateTime;

		const wednesday = await fixture.controller.runDueSchedule(schedule.id);

		expect({
			wednesday,
			runs: fixture.runs.runs.length,
			occurrences: fixture.occurrences.occurrences.length,
			nextRunAt: fixture.schedules.rows.map((saved) => saved.status === 'active' && saved.nextRunAt)
		}).toEqual({
			wednesday: { kind: 'skipped' },
			runs: 1,
			occurrences: 1,
			nextRunAt: ['2026-11-19T07:00:00.000Z']
		});
	});
});
