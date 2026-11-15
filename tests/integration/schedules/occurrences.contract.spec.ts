import { describe, expect, it } from 'vitest';
import type { AgentRunId, ConversationId } from '$lib/models/agent';
import type { UserId } from '$lib/models/identity';
import type {
	IanaTimeZone,
	Schedule,
	ScheduleId,
	ScheduleOccurrence,
	ScheduleOccurrenceId
} from '$lib/models/schedules';
import type { DateTime } from '$lib/models/workspace';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { AgentRunRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import {
	ScheduleBacklogRecords,
	ScheduleOccurrenceRecords,
	ScheduleRecords
} from '$lib/server/repositories/schedules/postgres/schedules';
import { context, now, seedUser } from '../database-harness';

type Owner = Awaited<ReturnType<typeof seedUser>>;

const tuesdayRun = '2026-11-17T07:00:00.000Z' as DateTime;
const ranAt = '2026-11-17T07:00:20.000Z' as DateTime;

const saveSchedule = (owner: Owner, nextRunAt: DateTime = tuesdayRun): Promise<Schedule> =>
	new ScheduleRecords(owner, context.db).insert({
		id: crypto.randomUUID() as ScheduleId,
		userId: owner.userId as UserId,
		title: 'Morning brief',
		prompt: 'Write a brief of what is due today as a note in Inbox.',
		recurrence: { kind: 'weekdays', time: { hour: 8, minute: 0 } },
		timeZone: 'Europe/Brussels' as IanaTimeZone,
		skillNoteIds: [],
		executionMode: 'approval_required',
		status: 'active',
		nextRunAt,
		createdAt: '2026-11-16T08:12:00.000Z' as DateTime,
		updatedAt: '2026-11-16T08:12:00.000Z' as DateTime
	});

/** An occurrence with the chat and the queued run it started, as the harness saves them together. */
const recordRun = async (
	owner: Owner,
	scheduleId: ScheduleId,
	scheduledFor: DateTime = tuesdayRun
): Promise<ScheduleOccurrence> => {
	const conversation = await new ConversationRecords(owner, context.db).insert({
		id: crypto.randomUUID() as ConversationId,
		userId: owner.userId,
		kind: 'chat',
		title: 'Morning brief',
		createdAt: now,
		updatedAt: now
	});
	const occurrenceId = crypto.randomUUID() as ScheduleOccurrenceId;
	const run = await new AgentRunRecords(owner, context.db).insert({
		kind: 'agent',
		id: crypto.randomUUID() as AgentRunId,
		userId: owner.userId,
		conversationId: conversation.id,
		model: 'test/model',
		executionMode: 'approval_required',
		status: 'queued',
		requestId: occurrenceId,
		pendingDecisions: [],
		inputSnapshot: { conversationId: conversation.id, prompt: 'Write a brief.' },
		createdAt: now,
		updatedAt: now
	});
	return new ScheduleOccurrenceRecords(owner, context.db).insert({
		id: occurrenceId,
		userId: owner.userId as UserId,
		scheduleId,
		trigger: 'recurrence',
		scheduledFor,
		conversationId: conversation.id,
		runId: run.id,
		createdAt: ranAt
	});
};

describe('the storage of schedule runs', () => {
	it('lists the schedules whose time has come with their owners, earliest first', async () => {
		const owner = await seedUser('9701');
		const other = await seedUser('9702');
		const later = await saveSchedule(owner, '2026-11-17T07:30:00.000Z' as DateTime);
		const earlier = await saveSchedule(other);
		const tomorrow = await saveSchedule(owner, '2026-11-18T07:00:00.000Z' as DateTime);
		const ours = new Set([later.id, earlier.id, tomorrow.id]);

		const due = await new ScheduleBacklogRecords(context.db).listDue(
			'2026-11-17T07:30:00.000Z' as DateTime
		);

		expect(due.filter((item) => ours.has(item.scheduleId))).toEqual([
			{ owner: { userId: other.userId }, scheduleId: earlier.id },
			{ owner: { userId: owner.userId }, scheduleId: later.id }
		]);
	});

	it('refuses a second run for the same occurrence of a schedule', async () => {
		const owner = await seedUser('9711');
		const schedule = await saveSchedule(owner);
		await recordRun(owner, schedule.id);

		const refusal = await recordRun(owner, schedule.id).catch((error: Error) => error);

		const rows = await context.client<{ count: number }[]>`
			select count(*)::int as count from schedule_occurrences where schedule_id = ${schedule.id}`;
		expect([refusal instanceof Error && String(refusal.cause), rows]).toEqual([
			expect.stringContaining('schedule_occurrences_recurrence_unique'),
			[{ count: 1 }]
		]);
	});

	it('reports a waiting run only while the run is parked for approval', async () => {
		const owner = await seedUser('9721');
		const schedule = await saveSchedule(owner);
		const occurrence = await recordRun(owner, schedule.id);
		const occurrences = new ScheduleOccurrenceRecords(owner, context.db);

		const queued = await occurrences.hasRunAwaitingApproval(schedule.id);
		await context.client`
			update agent_runs set status = 'awaiting_approval' where id = ${occurrence.runId}`;
		const parked = await occurrences.hasRunAwaitingApproval(schedule.id);
		await context.client`update agent_runs set status = 'completed' where id = ${occurrence.runId}`;
		const decided = await occurrences.hasRunAwaitingApproval(schedule.id);

		expect([queued, parked, decided]).toEqual([false, true, false]);
	});

	it('lists a schedule\u2019s runs newest first, each with the state of its agent run', async () => {
		const owner = await seedUser('9751');
		const stranger = await seedUser('9752');
		const schedule = await saveSchedule(owner);
		const tuesday = await recordRun(owner, schedule.id);
		const wednesday = await recordRun(owner, schedule.id, '2026-11-18T07:00:00.000Z' as DateTime);
		await context.client`
			update agent_runs set status = 'awaiting_approval' where id = ${wednesday.runId}`;

		const listed = await new ScheduleOccurrenceRecords(owner, context.db).listForSchedule(
			schedule.id
		);
		const foreign = await new ScheduleOccurrenceRecords(stranger, context.db).listForSchedule(
			schedule.id
		);

		expect([listed, foreign]).toEqual([
			[
				{ ...wednesday, status: 'awaiting_approval' },
				{ ...tuesday, status: 'queued' }
			],
			[]
		]);
	});

	it('records when the owner opened a run, and nothing for a stranger', async () => {
		const owner = await seedUser('9761');
		const stranger = await seedUser('9762');
		const schedule = await saveSchedule(owner);
		const occurrence = await recordRun(owner, schedule.id);
		const openedAt = '2026-11-17T09:30:00.000Z' as DateTime;

		const refusal = await new ScheduleOccurrenceRecords(stranger, context.db)
			.markOpened(occurrence.id, openedAt)
			.catch((error: Error) => error.message);
		const untouched = await context.client<{ opened_at: Date | null }[]>`
			select opened_at from schedule_occurrences where id = ${occurrence.id}`;
		await new ScheduleOccurrenceRecords(owner, context.db).markOpened(occurrence.id, openedAt);

		expect([
			refusal,
			untouched,
			await new ScheduleOccurrenceRecords(owner, context.db).listForSchedule(schedule.id)
		]).toEqual([
			'Scheduled run was not found',
			[{ opened_at: null }],
			[{ ...occurrence, openedAt, status: 'queued' }]
		]);
	});

	it('keeps a run and its chat when its schedule is deleted', async () => {
		const owner = await seedUser('9731');
		const schedule = await saveSchedule(owner);
		const occurrence = await recordRun(owner, schedule.id);

		await new ScheduleRecords(owner, context.db).delete(schedule.id);

		const rows = await context.client<{ schedule_id: string | null; run_id: string }[]>`
			select schedule_id, run_id from schedule_occurrences where id = ${occurrence.id}`;
		expect(rows).toEqual([{ schedule_id: null, run_id: occurrence.runId }]);
	});

	it('reaches the owner’s devices as a synchronized record', async () => {
		const owner = await seedUser('9741');
		const schedule = await saveSchedule(owner);
		const occurrence = await recordRun(owner, schedule.id);

		const read = await createSyncCapability(owner, { db: context.db }).objects.read(
			{ type: 'schedule_occurrences', id: [occurrence.id] },
			null
		);

		expect(read.kind === 'found' && read.snapshot.value).toEqual({
			type: 'schedule_occurrences',
			value: occurrence
		});
	});
});
