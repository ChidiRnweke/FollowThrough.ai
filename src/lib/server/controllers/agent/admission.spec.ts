import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictError } from '$lib/errors';
import type { DateTime } from '$lib/models/workspace';
import { RunAdmissionRules } from '$lib/server/services/agent/runs/admission';
import { AgentRunStatusService } from '$lib/services/agent/run-status';
import { agentSubmissionFixture } from '$lib/testing/agent/fixtures/submission';
import { scheduledRunsFixture } from '$lib/testing/schedules/fixtures/runs';
import { scheduleBuilder, tuesdayRun } from '$lib/testing/schedules/fixtures/schedules';
import {
	agentRunBuilder,
	testActor,
	testAgentRunId,
	testConversationId
} from '$lib/testing/workspace/fixtures/domain-builders';

const runStatus = new AgentRunStatusService();

const active: ReturnType<typeof agentSubmissionFixture>[] = [];
const track = <T extends ReturnType<typeof agentSubmissionFixture>>(fixture: T): T => {
	active.push(fixture);
	return fixture;
};
afterEach(async () => {
	for (const fixture of active.splice(0)) {
		// Only the actor's own runs: a run another account owns is not this controller's to settle.
		const owned = () => fixture.runs.runs.filter((run) => run.userId === testActor().userId);
		for (const run of owned()) await fixture.controller.cancel(run.id);
		fixture.release();
		await vi.waitFor(() => {
			if (owned().some((run) => !runStatus.isTerminal(run.status)))
				throw new Error('Run did not settle after fixture cleanup');
		});
	}
});

const limited = (
	phase: Parameters<typeof agentSubmissionFixture>[0],
	limits: { readonly perAccount: number; readonly total: number }
) => track(agentSubmissionFixture(phase, {}, { runAdmission: new RunAdmissionRules(limits) }));

const ask = (fixture: ReturnType<typeof agentSubmissionFixture>, input: string) =>
	fixture.controller.submit({ requestId: crypto.randomUUID(), input });

/** The failure a refused operation reports, or that it was not refused. */
const refusal = (operation: Promise<unknown>) =>
	operation.then(
		() => 'admitted',
		(error: unknown) => (error instanceof ConflictError ? error.message : error)
	);

describe('admitting a chat run', () => {
	it('admits five executing runs for one account and refuses the sixth, saving nothing for it', async () => {
		const fixture = track(agentSubmissionFixture('queued'));
		const admitted = [];
		for (const input of ['One', 'Two', 'Three', 'Four', 'Five'])
			admitted.push((await ask(fixture, input)).status);

		const sixth = await refusal(ask(fixture, 'Six'));

		expect({
			admitted,
			sixth,
			runs: fixture.runs.runs.length,
			chats: fixture.conversations.conversations.length,
			prompts: fixture.conversations.messages.length
		}).toEqual({
			admitted: ['queued', 'queued', 'queued', 'queued', 'queued'],
			sixth: 'You have 5 agent runs in progress. Wait for one to finish.',
			runs: 5,
			chats: 5,
			prompts: 5
		});
	});

	it('counts the runs that execute, not a run parked for its owner to decide', async () => {
		const fixture = limited('approval', { perAccount: 2, total: 50 });
		await ask(fixture, 'Archive the old note');
		await vi.waitFor(() => {
			if (fixture.runs.runs[0]?.status !== 'awaiting_approval')
				throw new Error('The first run has not parked for approval');
		});
		fixture.pauseExecution();

		const second = await refusal(ask(fixture, 'Two'));
		const third = await refusal(ask(fixture, 'Three'));
		const fourth = await refusal(ask(fixture, 'Four'));

		expect([second, third, fourth]).toEqual([
			'admitted',
			'admitted',
			'You have 2 agent runs in progress. Wait for one to finish.'
		]);
	});

	it("refuses a run once the deployment's executing runs reach the total, whoever owns them", async () => {
		const fixture = limited('queued', { perAccount: 5, total: 2 });
		fixture.runs.runs.push(
			agentRunBuilder({
				id: testAgentRunId(90),
				userId: testActor(2).userId,
				conversationId: testConversationId(90),
				requestId: 'another-account-run',
				status: 'running',
				startedAt: tuesdayRun
			})
		);

		const own = await refusal(ask(fixture, 'One'));
		const next = await refusal(ask(fixture, 'Two'));

		expect([own, next]).toEqual([
			'admitted',
			'This server is running as many agent runs as it allows. Try again in a moment.'
		]);
	});

	it('refuses a retry over the limit and leaves the stopped run as it was', async () => {
		const fixture = limited('queued', { perAccount: 1, total: 50 });
		const stopped = await ask(fixture, 'Try this once');
		await fixture.controller.cancel(stopped.runId);
		await ask(fixture, 'Something else meanwhile');

		const retried = await refusal(fixture.controller.retry(stopped.runId, crypto.randomUUID()));

		expect({
			retried,
			runs: fixture.runs.runs.map((run) => run.status),
			retries: fixture.runs.runs.filter((run) => run.retryOfRunId).length
		}).toEqual({
			retried: 'You have 1 agent run in progress. Wait for one to finish.',
			runs: ['cancelled', 'queued'],
			retries: 0
		});
	});
});

describe('admitting the run of a schedule', () => {
	const afterTuesdayRun = '2026-11-17T07:00:20.000Z' as DateTime;
	const busy = async (schedule: ReturnType<typeof scheduleBuilder>) => {
		const fixture = track(scheduledRunsFixture([schedule], afterTuesdayRun));
		const chats = [];
		for (const input of ['One', 'Two', 'Three', 'Four', 'Five'])
			chats.push(await ask(fixture, input));
		return { fixture, chats };
	};

	it('saves a due run that was not admitted as failed, with why, and admits the next occurrence', async () => {
		const schedule = scheduleBuilder({ executionMode: 'auto_accept' });
		const { fixture, chats } = await busy(schedule);

		const tuesday = await fixture.controller.runDueSchedule(schedule.id);
		const refused = fixture.runs.runs.find(
			(run) => run.kind === 'agent' && run.inputSnapshot.schedule
		);
		await fixture.controller.cancel(chats[0]!.runId);
		fixture.clock.now = '2026-11-18T07:00:20.000Z' as DateTime;
		const wednesday = await fixture.controller.runDueSchedule(schedule.id);

		expect({
			tuesday: tuesday.kind,
			refused: refused && { status: refused.status, failure: refused.failure },
			occurrences: fixture.occurrences.occurrences.map((occurrence) => ({
				scheduledFor: occurrence.scheduledFor,
				refused: occurrence.runId === refused?.id
			})),
			prompt: fixture.conversations.messages.filter(
				(message) => message.conversationId === refused?.conversationId
			).length,
			wednesday: wednesday.kind
		}).toEqual({
			tuesday: 'refused',
			refused: {
				status: 'failed',
				failure:
					'This scheduled run did not start: you had 5 agent runs in progress. Retry it when one finishes.'
			},
			occurrences: [
				{ scheduledFor: tuesdayRun, refused: true },
				{ scheduledFor: '2026-11-18T07:00:00.000Z', refused: false }
			],
			prompt: 1,
			wednesday: 'started'
		});
	});

	it('tells the owner at once when a run they asked for now is over the limit, and records nothing', async () => {
		const schedule = scheduleBuilder({ status: 'paused' });
		const { fixture } = await busy(schedule);

		const now = await refusal(
			fixture.controller.runScheduleNow({ scheduleId: schedule.id, requestId: crypto.randomUUID() })
		);

		expect({
			now,
			runs: fixture.runs.runs.length,
			occurrences: fixture.occurrences.occurrences.length
		}).toEqual({
			now: 'You have 5 agent runs in progress. Wait for one to finish.',
			runs: 5,
			occurrences: 0
		});
	});
});
