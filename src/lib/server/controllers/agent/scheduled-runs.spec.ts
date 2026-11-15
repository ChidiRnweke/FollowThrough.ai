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
import {
	scheduleModel,
	scheduleProject,
	scheduleSkill
} from '$lib/testing/schedules/fixtures/start';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

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

	it('runs a schedule now when its owner asks, without moving its next run', async () => {
		const paused = scheduleBuilder({ status: 'paused' });
		const fixture = setup([paused], afterTuesdayRun);
		const requestId = '5d000000-0000-4000-8000-000000000009';

		const receipt = await fixture.controller.runScheduleNow({ scheduleId: paused.id, requestId });
		const repeated = await fixture.controller.runScheduleNow({ scheduleId: paused.id, requestId });

		expect({
			sameRun: repeated.runId === receipt.runId,
			runs: fixture.runs.runs.map((run) => run.requestId),
			occurrences: fixture.occurrences.occurrences.map((occurrence) => ({
				id: occurrence.id,
				trigger: occurrence.trigger,
				scheduledFor: occurrence.scheduledFor,
				runId: occurrence.runId
			})),
			schedule: fixture.schedules.rows
		}).toEqual({
			sameRun: true,
			runs: [requestId],
			occurrences: [
				{ id: requestId, trigger: 'manual', scheduledFor: afterTuesdayRun, runId: receipt.runId }
			],
			schedule: [paused]
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

describe('what a schedule names for its runs', () => {
	const named = () =>
		scheduleBuilder({
			projectId: scheduleProject.id,
			model: scheduleModel,
			skillNoteIds: [scheduleSkill().note.id]
		});

	/** Starts the due run, waits until it has failed, then asks the worker's question again. */
	const failedStart = async (fixture: ReturnType<typeof setup>) => {
		const [schedule] = fixture.schedules.rows;
		const start = await fixture.controller.runDueSchedule(schedule!.id);
		await vi.waitFor(() => {
			if (fixture.runs.runs[0]?.status !== 'failed') throw new Error('The run has not failed yet');
		});
		const nextTick = await fixture.controller.runDueSchedule(schedule!.id);
		return {
			started: [start.kind, nextTick.kind],
			runs: fixture.runs.runs.length,
			occurrences: fixture.occurrences.occurrences.length,
			failure: fixture.runs.runs[0]?.failure,
			nextRunAt: fixture.schedules.rows.map((saved) => saved.status === 'active' && saved.nextRunAt)
		};
	};
	/** One run and one occurrence, the schedule moved to Wednesday, and nothing more to start. */
	const failedOnce = (failure: string) => ({
		started: ['started', 'not_due'],
		runs: 1,
		occurrences: 1,
		failure,
		nextRunAt: [wednesdayRun]
	});

	it('starts the run in the schedule\u2019s project, on its model, with its skills', async () => {
		const schedule = named();
		const fixture = setup([schedule], afterTuesdayRun);

		await fixture.controller.runDueSchedule(schedule.id);

		const [run] = fixture.runs.runs;
		const [conversation] = fixture.conversations.conversations;
		expect({
			chat: [conversation?.contextProjectId, conversation?.modelOverride],
			model: run?.model,
			input: run?.kind === 'agent' && [
				run.inputSnapshot.projectId,
				run.inputSnapshot.requestedSkillNoteIds
			]
		}).toEqual({
			chat: [scheduleProject.id, scheduleModel],
			model: scheduleModel,
			input: [scheduleProject.id, [scheduleSkill().note.id]]
		});
	});

	it('runs a schedule that names no model on its owner\u2019s default model', async () => {
		const schedule = scheduleBuilder();
		const fixture = setup([schedule], afterTuesdayRun);

		await fixture.controller.runDueSchedule(schedule.id);

		const [run] = fixture.runs.runs;
		const [conversation] = fixture.conversations.conversations;
		expect([run?.model, conversation?.modelOverride, conversation?.contextProjectId]).toEqual([
			'openai/test-model',
			undefined,
			undefined
		]);
	});

	it('fails the run, once, when the schedule\u2019s model is no longer offered', async () => {
		const fixture = setup([named()], afterTuesdayRun, 'running');
		fixture.models.models = [];

		const outcome = await failedStart(fixture);

		expect([outcome, fixture.runs.runs[0]?.providerErrorCode]).toEqual([
			failedOnce(
				`This schedule's model, ${scheduleModel}, is no longer offered. Choose another model on the schedule's page, then run it again.`
			),
			'MODEL_UNAVAILABLE'
		]);
	});

	it('fails the run, once, when the schedule\u2019s project is archived', async () => {
		const fixture = setup([named()], afterTuesdayRun, 'running');
		await fixture.projects.archive(scheduleProject.id);

		expect(await failedStart(fixture)).toEqual(
			failedOnce(
				"This schedule's project is archived or no longer exists. Choose another project on the schedule's page, then run it again."
			)
		);
	});

	it('fails the run, once, when a skill the schedule names is turned off', async () => {
		const fixture = setup([named()], afterTuesdayRun, 'running');
		fixture.skills.skills = [{ ...scheduleSkill(), isEnabled: false }];

		expect(await failedStart(fixture)).toEqual(
			failedOnce(
				"A skill this schedule uses is turned off or no longer exists. Remove it on the schedule's page, then run it again."
			)
		);
	});

	it('still runs a chat that mentions a skill which is gone', async () => {
		const fixture = setup([], afterTuesdayRun, 'running');

		await fixture.controller.submit({
			requestId: crypto.randomUUID(),
			input: 'Plan my day',
			requestedSkillNoteIds: [testNoteId(99)]
		});
		await vi.waitFor(() => {
			if (fixture.runs.runs[0]?.status === 'queued') throw new Error('The run has not started');
		});

		expect(fixture.runs.runs.map((run) => [run.status, run.failure])).toEqual([
			['running', undefined]
		]);
	});
});
