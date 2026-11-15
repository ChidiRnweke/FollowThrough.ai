import { describe, expect, it } from 'vitest';
import type { UserId } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { IanaTimeZone, Schedule, ScheduleId } from '$lib/models/schedules';
import type { DateTime, LocalDate } from '$lib/models/workspace';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { ScheduleRecords } from '$lib/server/repositories/schedules/postgres/schedules';
import { context, seedNote, seedUser } from '../database-harness';

const scheduleId = (suffix: string) =>
	`5c000000-0000-4000-8000-${suffix.padStart(12, '0')}` as ScheduleId;
const saved = '2026-11-16T08:12:00.000Z' as DateTime;
/** A skill is a note, and the column holds note ids without a foreign key. */
const skillId = (suffix: string) => `4a000000-0000-4000-8000-${suffix.padStart(12, '0')}` as NoteId;

const syncVersion = async (id: ScheduleId): Promise<bigint | undefined> => {
	const rows = await context.client<{ version: string }[]>`
		select version::text from workspace_sync_versions
		where resource_type = 'schedules' and resource_id = jsonb_build_array(${id}::text)`;
	return rows[0] ? BigInt(rows[0].version) : undefined;
};

const weekdayBrief = (id: ScheduleId, userId: string): Schedule => ({
	id,
	userId: userId as UserId,
	title: 'Morning brief',
	prompt: 'Write a brief of what is due today as a note in Inbox.',
	recurrence: { kind: 'weekdays', time: { hour: 8, minute: 0 } },
	timeZone: 'Europe/Brussels' as IanaTimeZone,
	skillNoteIds: [],
	executionMode: 'approval_required',
	status: 'active',
	nextRunAt: '2026-11-17T07:00:00.000Z' as DateTime,
	createdAt: saved,
	updatedAt: saved
});

describe('schedule storage', () => {
	it('returns each state of a schedule as it was saved', async () => {
		const owner = await seedUser('9601');
		const records = new ScheduleRecords(owner, context.db);
		const active = weekdayBrief(scheduleId('9601'), owner.userId);
		const paused: Schedule = {
			id: scheduleId('9602'),
			userId: active.userId,
			title: 'Weekly review',
			prompt: 'Review what closed this week.',
			recurrence: { kind: 'weekly', weekday: 'fri', time: { hour: 16, minute: 0 } },
			timeZone: active.timeZone,
			skillNoteIds: [],
			executionMode: 'auto_accept',
			status: 'paused',
			createdAt: '2026-11-16T08:13:00.000Z' as DateTime,
			updatedAt: '2026-11-16T08:13:00.000Z' as DateTime
		};
		const finished: Schedule = {
			...paused,
			id: scheduleId('9603'),
			title: 'Domain renewal check',
			recurrence: { kind: 'once', date: '2026-11-02' as LocalDate, time: { hour: 9, minute: 0 } },
			status: 'finished',
			createdAt: '2026-11-16T08:14:00.000Z' as DateTime,
			updatedAt: '2026-11-16T08:14:00.000Z' as DateTime
		};

		await records.insert(active);
		await records.insert(paused);
		await records.insert(finished);

		expect(await records.list()).toEqual([active, paused, finished]);
	});

	it('drops the next run when an active schedule is saved as paused', async () => {
		const owner = await seedUser('9611');
		const records = new ScheduleRecords(owner, context.db);
		const active = weekdayBrief(scheduleId('9611'), owner.userId);
		await records.insert(active);
		const later = '2026-11-16T09:00:00.000Z' as DateTime;
		const { id, userId, title, prompt, recurrence, timeZone, executionMode, createdAt } = active;

		await records.update({
			id,
			userId,
			title,
			prompt,
			recurrence,
			timeZone,
			skillNoteIds: [],
			executionMode,
			createdAt,
			status: 'paused',
			updatedAt: later
		});

		const rows = await context.client<{ status: string; next_run_at: Date | null }[]>`
			select status, next_run_at from schedules where id = ${id}`;
		expect(rows).toEqual([{ status: 'paused', next_run_at: null }]);
	});

	it('refuses a row that is active without a next run', async () => {
		const owner = await seedUser('9621');
		const records = new ScheduleRecords(owner, context.db);
		const active = weekdayBrief(scheduleId('9621'), owner.userId);
		await records.insert(active);

		const write = context.client`update schedules set next_run_at = null where id = ${active.id}`;

		await expect(write).rejects.toThrow(/schedules_next_run_check/);
	});

	it('keeps one user’s schedules out of another user’s reads and writes', async () => {
		const owner = await seedUser('9631');
		const stranger = await seedUser('9632');
		const active = weekdayBrief(scheduleId('9631'), owner.userId);
		await new ScheduleRecords(owner, context.db).insert(active);
		const strangers = new ScheduleRecords(stranger, context.db);

		const attempts = await Promise.all([
			strangers.findById(active.id),
			strangers.list(),
			strangers.delete(active.id).catch((error: Error) => error.message)
		]);

		expect([attempts, await new ScheduleRecords(owner, context.db).findById(active.id)]).toEqual([
			[undefined, [], 'Schedule was not found'],
			active
		]);
	});

	it('reaches the owner’s devices as a synchronized record', async () => {
		const owner = await seedUser('9641');
		const active = weekdayBrief(scheduleId('9641'), owner.userId);
		await new ScheduleRecords(owner, context.db).insert(active);

		const read = await createSyncCapability(owner, { db: context.db }).objects.read(
			{ type: 'schedules', id: [active.id] },
			null
		);

		expect(read.kind === 'found' && read.snapshot.value).toEqual({
			type: 'schedules',
			value: active
		});
	});

	it('returns the project, the model and the skills of a schedule, with the skills in their order', async () => {
		const { owner, project } = await seedNote('9651');
		const records = new ScheduleRecords(owner, context.db);
		const named: Schedule = {
			...weekdayBrief(scheduleId('9651'), owner.userId),
			projectId: project.id,
			model: 'anthropic/careful-model',
			skillNoteIds: [skillId('2'), skillId('1'), skillId('3')]
		};

		await records.insert(named);
		const read = await createSyncCapability(owner, { db: context.db }).objects.read(
			{ type: 'schedules', id: [named.id] },
			null
		);

		expect([
			await records.findById(named.id),
			read.kind === 'found' && read.snapshot.value
		]).toEqual([named, { type: 'schedules', value: named }]);
	});

	it('removes the project and the model when a schedule is saved without them', async () => {
		const { owner, project } = await seedNote('9661');
		const records = new ScheduleRecords(owner, context.db);
		const plain = weekdayBrief(scheduleId('9661'), owner.userId);
		await records.insert({
			...plain,
			projectId: project.id,
			model: 'anthropic/careful-model',
			skillNoteIds: [skillId('1')]
		});

		await records.update(plain);

		const rows = await context.client<
			{ project_id: string | null; model: string | null; skill_note_ids: string[] }[]
		>`select project_id, model, skill_note_ids from schedules where id = ${plain.id}`;
		expect([rows, await records.findById(plain.id)]).toEqual([
			[{ project_id: null, model: null, skill_note_ids: [] }],
			plain
		]);
	});

	it('reads a row written before a schedule could name anything as naming nothing', async () => {
		const owner = await seedUser('9671');
		const plain = weekdayBrief(scheduleId('9671'), owner.userId);

		// The columns release 6.6.0 wrote; the new ones take their defaults.
		await context.client`
			insert into schedules (id, user_id, title, prompt, recurrence, time_zone, execution_mode,
				status, next_run_at, created_at, updated_at)
			values (${plain.id}, ${owner.userId}, ${plain.title}, ${plain.prompt},
				${JSON.stringify(plain.recurrence)}::jsonb, ${plain.timeZone}, ${plain.executionMode},
				'active', '2026-11-17T07:00:00.000Z', ${plain.createdAt}, ${plain.updatedAt})`;

		expect(await new ScheduleRecords(owner, context.db).findById(plain.id)).toEqual(plain);
	});

	it('clears the project of a schedule when the project row is deleted, and tells the devices', async () => {
		const { owner, project } = await seedNote('9681');
		const records = new ScheduleRecords(owner, context.db);
		const named = { ...weekdayBrief(scheduleId('9681'), owner.userId), projectId: project.id };
		await records.insert(named);
		const before = await syncVersion(named.id);

		await context.client`delete from projects where id = ${project.id}`;

		const after = await syncVersion(named.id);
		expect([
			await records.findById(named.id),
			before !== undefined && after !== undefined && after > before
		]).toEqual([weekdayBrief(scheduleId('9681'), owner.userId), true]);
	});

	it('deletes a user whose schedule names one of their projects', async () => {
		const { owner, project } = await seedNote('9691');
		const named = { ...weekdayBrief(scheduleId('9691'), owner.userId), projectId: project.id };
		await new ScheduleRecords(owner, context.db).insert(named);

		await context.client`delete from users where id = ${owner.userId}`;

		const rows = await context.client<{ id: string }[]>`
			select id from schedules where id = ${named.id}`;
		expect(rows).toEqual([]);
	});

	it('refuses a blank model', async () => {
		const owner = await seedUser('9695');
		const plain = weekdayBrief(scheduleId('9695'), owner.userId);
		await new ScheduleRecords(owner, context.db).insert(plain);

		const write = context.client`update schedules set model = '  ' where id = ${plain.id}`;

		await expect(write).rejects.toThrow(/schedules_model_check/);
	});
});
