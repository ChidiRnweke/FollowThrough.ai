import { describe, expect, it } from 'vitest';
import type { AgentRunId, ConversationId } from '$lib/models/agent';
import type { ScheduleOccurrenceId } from '$lib/models/schedules';
import { resourceDataSchemas, type WorkspaceRecord } from '$lib/models/workspace-records';
import type { DateTime } from '$lib/models/workspace';
import { createWorkspaceViews } from '$lib/factories/workspace/views';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import {
	brussels,
	scheduleBuilder,
	testScheduleId,
	tuesdayRun
} from '$lib/testing/schedules/fixtures/schedules';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const { workspaceRecordIdentity, workspaceResourceKey } = new WorkspaceCommandRulesService();

const id = (prefix: string, suffix: number) => `${prefix}-0000-4000-8000-00000000000${suffix}`;
const instant = (value: string) => value as DateTime;
/** Wednesday 18 November 2026, 12:00 in Brussels. */
const viewer = { now: instant('2026-11-18T11:00:00.000Z'), timeZone: brussels };

/** One run of the morning brief as the server leaves it: the chat, the run, its messages and the occurrence. */
const run = (
	suffix: number,
	scheduledFor: string,
	state:
		| { status: 'completed'; answer: string; openedAt?: string }
		| { status: 'awaiting_approval'; pending: number }
		| { status: 'running' }
): WorkspaceRecord[] => {
	const conversationId = id('33000000', suffix) as ConversationId;
	const runId = id('32000000', suffix) as AgentRunId;
	const ended = instant(new Date(Date.parse(scheduledFor) + 90_000).toISOString());
	return [
		{
			type: 'conversations',
			value: resourceDataSchemas.conversations.parse({
				id: conversationId,
				userId: testActor().userId,
				kind: 'chat',
				title: 'Morning brief',
				createdAt: scheduledFor,
				updatedAt: ended
			})
		},
		{
			type: 'agent_runs',
			value: resourceDataSchemas.agent_runs.parse({
				id: runId,
				userId: testActor().userId,
				conversationId,
				status: state.status,
				pendingDecisions:
					state.status === 'awaiting_approval'
						? Array.from({ length: state.pending }, (_, index) => ({
								source: 'catalog',
								callId: `call-${index}`,
								toolName: 'create_todo',
								arguments: {}
							}))
						: [],
				createdAt: scheduledFor,
				updatedAt: ended
			})
		},
		...(state.status === 'completed'
			? [
					{
						type: 'messages' as const,
						value: resourceDataSchemas.messages.parse({
							id: id('34000000', suffix),
							conversationId,
							runId,
							role: 'assistant',
							kind: 'readable',
							content: { type: 'text', text: state.answer },
							createdAt: ended
						})
					}
				]
			: []),
		{
			type: 'schedule_occurrences',
			value: {
				id: id('5d000000', suffix) as ScheduleOccurrenceId,
				userId: testActor().userId,
				scheduleId: testScheduleId(),
				trigger: 'recurrence',
				scheduledFor: instant(scheduledFor),
				conversationId,
				runId,
				...(state.status === 'completed' && state.openedAt
					? { openedAt: instant(state.openedAt) }
					: {}),
				createdAt: instant(scheduledFor)
			}
		}
	];
};

const viewsOf = (records: readonly WorkspaceRecord[]) =>
	createWorkspaceViews(
		new Map(
			records.map((record) => [workspaceResourceKey(workspaceRecordIdentity(record)), record])
		)
	);

const brief = scheduleBuilder({
	status: 'active',
	nextRunAt: instant('2026-11-19T07:00:00.000Z')
});
const records: WorkspaceRecord[] = [
	{ type: 'schedules', value: brief },
	...run(1, '2026-11-16T07:00:00.000Z', {
		status: 'completed',
		answer: 'Two things first. Then the studio.',
		openedAt: '2026-11-16T09:00:00.000Z'
	}),
	...run(2, tuesdayRun, { status: 'completed', answer: '## Brief\n\nThree things first.' }),
	...run(3, '2026-11-18T07:00:00.000Z', { status: 'awaiting_approval', pending: 2 })
];

describe('the schedules a workspace shows', () => {
	it('lists each schedule with the runs that need its owner', () => {
		expect(viewsOf(records).schedules(viewer)).toEqual([
			{
				schedule: brief,
				caption: 'Weekdays at 08:00 · Asks first · Next: tomorrow, 08:00',
				waiting: 1,
				unopened: 1
			}
		]);
	});

	it('shows one schedule with its runs newest first, each in one line', () => {
		const detail = viewsOf(records).schedule(testScheduleId(), viewer);

		expect({
			standing: detail?.standing,
			runs: detail?.runs.map((entry) => [entry.ranAt, entry.state, entry.line])
		}).toEqual({
			standing: 'Next: tomorrow, 08:00. It is skipped if a run still waits for you then.',
			runs: [
				[
					'Today, 08:00',
					{ kind: 'waiting', changes: 2 },
					'Wants to make 2 changes. Waiting for you.'
				],
				[
					'Yesterday, 08:00',
					{ kind: 'finished', outcome: 'completed', opened: false },
					'Three things first.'
				],
				[
					'Mon 16 Nov, 08:00',
					{ kind: 'finished', outcome: 'completed', opened: true },
					'Two things first.'
				]
			]
		});
	});

	it('puts waiting runs and unopened runs in the bell, and leaves opened runs out', () => {
		const attention = viewsOf([
			...records,
			...run(4, '2026-11-18T07:00:30.000Z', { status: 'running' })
		]).scheduledAttention(viewer);

		expect({
			waiting: attention.waiting.map((notice) => [notice.title, notice.ranAt, notice.line]),
			finished: attention.finished.map((notice) => [notice.title, notice.ranAt, notice.line]),
			working: attention.working
		}).toEqual({
			waiting: [['Morning brief', 'Today, 08:00', 'Wants to make 2 changes. Waiting for you.']],
			finished: [['Morning brief', 'Yesterday, 08:00', 'Three things first.']],
			working: 1
		});
	});

	it('names a run for its chat once its schedule is deleted', () => {
		const orphaned = records.filter((record) => record.type !== 'schedules');

		expect(
			viewsOf(orphaned)
				.scheduledAttention(viewer)
				.waiting.map((notice) => notice.title)
		).toEqual(['Morning brief']);
	});

	it('tells a chat that a schedule started it, and no other chat', () => {
		const views = viewsOf(records);

		expect([
			views.scheduledChat(id('33000000', 2) as ConversationId)?.title,
			views.scheduledChat(id('33000000', 9) as ConversationId)
		]).toEqual(['Morning brief', null]);
	});
});
