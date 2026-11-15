import { describe, expect, it } from 'vitest';
import type { UserId } from '$lib/models/identity';
import type { IanaTimeZone, Schedule, ScheduleId } from '$lib/models/schedules';
import type { DateTime, LocalDate } from '$lib/models/workspace';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { ScheduleRecords } from '$lib/server/repositories/schedules/postgres/schedules';
import { context, seedUser } from '../database-harness';

const scheduleId = (suffix: string) =>
	`5c000000-0000-4000-8000-${suffix.padStart(12, '0')}` as ScheduleId;
const saved = '2026-11-16T08:12:00.000Z' as DateTime;

const weekdayBrief = (id: ScheduleId, userId: string): Schedule => ({
	id,
	userId: userId as UserId,
	title: 'Morning brief',
	prompt: 'Write a brief of what is due today as a note in Inbox.',
	recurrence: { kind: 'weekdays', time: { hour: 8, minute: 0 } },
	timeZone: 'Europe/Brussels' as IanaTimeZone,
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
});
