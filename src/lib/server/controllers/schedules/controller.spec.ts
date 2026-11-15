import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '$lib/errors';
import type { AgentRunId, AgentRunStatus, ConversationId } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type {
	Recurrence,
	ScheduleDefinition,
	ScheduleOccurrence,
	ScheduleOccurrenceId
} from '$lib/models/schedules';
import type { DateTime, LocalDate } from '$lib/models/workspace';
import { ScheduleLibrary } from '$lib/server/services/schedules/library';
import { ScheduleRuns } from '$lib/server/services/schedules/runs';
import { ScheduleRules } from '$lib/services/schedules/rules';
import {
	InMemoryScheduleOccurrenceRepository,
	InMemoryScheduleRepository,
	InMemoryScheduleTable
} from '$lib/testing/schedules/fakes/in-memory-schedules';
import {
	brussels,
	mondayMorning,
	scheduleBuilder,
	testScheduleId,
	tuesdayRun
} from '$lib/testing/schedules/fixtures/schedules';
import {
	scheduleModel,
	scheduleProject,
	scheduleSkill,
	scheduleStartFixture
} from '$lib/testing/schedules/fixtures/start';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	projectBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { Schedules } from './controller';

const definition: ScheduleDefinition = {
	title: 'Morning brief',
	prompt: 'Write a brief of what is due today as a note in Inbox.',
	recurrence: { kind: 'weekdays', time: { hour: 8, minute: 0 } },
	timeZone: brussels,
	skillNoteIds: [],
	executionMode: 'approval_required'
};

/** The same schedule, naming a project, a model and a skill its owner can use. */
const named: ScheduleDefinition = {
	...definition,
	projectId: scheduleProject.id,
	model: scheduleModel,
	skillNoteIds: [scheduleSkill().note.id]
};

const setup = () => {
	const table = new InMemoryScheduleTable();
	const runStatus = new Map<AgentRunId, AgentRunStatus>();
	const occurrences = new InMemoryScheduleOccurrenceRepository((runId) => runStatus.get(runId));
	const clock = { now: mondayMorning };
	const start = scheduleStartFixture(testActor());
	const controllerFor = (actor: ActorContext, checks = scheduleStartFixture(actor)) => {
		const library = new ScheduleLibrary(new InMemoryScheduleRepository(actor, table));
		return new Schedules(actor, {
			now: () => clock.now,
			rules: new ScheduleRules(),
			reader: library,
			writer: library,
			runs: new ScheduleRuns(occurrences),
			transactionRunner: new InMemoryTransactionRunner([table]),
			...checks.dependencies
		});
	};
	return {
		clock,
		occurrences,
		runStatus,
		/** What the first user's schedules can name. */
		start,
		controller: controllerFor(testActor(), start),
		other: controllerFor(testActor(2))
	};
};

describe('a user’s schedules', () => {
	it('saves a new schedule as active from its next occurrence', async () => {
		const { controller } = setup();

		const created = await controller.create({ id: testScheduleId(), definition });

		expect([created, await controller.list()]).toEqual([
			{ schedule: scheduleBuilder() },
			{ schedules: [scheduleBuilder()] }
		]);
	});

	it('refuses a one-off schedule whose time has passed and saves nothing', async () => {
		const { controller } = setup();
		const past: Recurrence = {
			kind: 'once',
			date: '2026-11-02' as LocalDate,
			time: { hour: 9, minute: 0 }
		};

		const refusal = await controller
			.create({ id: testScheduleId(), definition: { ...definition, recurrence: past } })
			.catch((error: Error) => error);

		expect([refusal, await controller.list()]).toEqual([
			new ValidationError('This schedule has no run in the future. Choose a later date and time.'),
			{ schedules: [] }
		]);
	});

	it('moves the next run when the recurrence changes', async () => {
		const { controller } = setup();
		await controller.create({ id: testScheduleId(), definition });
		const fridays: Recurrence = { kind: 'weekly', weekday: 'fri', time: { hour: 16, minute: 0 } };

		await controller.update({ scheduleId: testScheduleId(), changes: { recurrence: fridays } });

		expect(await controller.get({ scheduleId: testScheduleId() })).toEqual({
			schedule: scheduleBuilder({
				recurrence: fridays,
				status: 'active',
				nextRunAt: '2026-11-20T15:00:00.000Z' as DateTime
			})
		});
	});

	it('saves the project, the model and the skills a schedule names', async () => {
		const { controller } = setup();

		await controller.create({ id: testScheduleId(), definition: named });

		expect(await controller.get({ scheduleId: testScheduleId() })).toEqual({
			schedule: scheduleBuilder({
				projectId: scheduleProject.id,
				model: scheduleModel,
				skillNoteIds: [scheduleSkill().note.id]
			})
		});
	});

	it('refuses a schedule that names what its owner cannot use, and saves nothing', async () => {
		const { controller, start } = setup();
		start.projects.projects = [
			...start.projects.projects,
			projectBuilder({ id: testProjectId(8), archivedAt: mondayMorning }),
			projectBuilder({ id: testProjectId(9), userId: testActor(2).userId })
		];
		start.skills.skills = [
			...start.skills.skills,
			{ ...scheduleSkill(testNoteId(42), 'Old habits'), isEnabled: false }
		];
		const refusal = (attempt: ScheduleDefinition) =>
			controller
				.create({ id: testScheduleId(), definition: attempt })
				.catch((error: Error) => error.message);

		expect([
			await refusal({ ...named, model: 'vendor/withdrawn' }),
			await refusal({ ...named, projectId: testProjectId(8) }),
			await refusal({ ...named, projectId: testProjectId(9) }),
			await refusal({ ...named, skillNoteIds: [testNoteId(42)] }),
			await refusal({ ...named, skillNoteIds: [testNoteId(99)] }),
			await controller.list()
		]).toEqual([
			'The selected model is unavailable or does not support tools',
			'This project is archived or does not exist. Choose another project.',
			'This project is archived or does not exist. Choose another project.',
			'A skill is turned off or does not exist. Choose another skill.',
			'A skill is turned off or does not exist. Choose another skill.',
			{ schedules: [] }
		]);
	});

	it('still renames a schedule whose model is no longer offered, and refuses to name that model again', async () => {
		const { controller, start } = setup();
		await controller.create({ id: testScheduleId(), definition: named });
		start.models.models = [];

		const renamed = await controller.update({
			scheduleId: testScheduleId(),
			changes: { title: 'Brief' }
		});
		const namedAgain = await controller
			.update({ scheduleId: testScheduleId(), changes: { model: scheduleModel } })
			.catch((error: Error) => error.message);

		expect([renamed.schedule.title, renamed.schedule.model, namedAgain]).toEqual([
			'Brief',
			scheduleModel,
			'The selected model is unavailable or does not support tools'
		]);
	});

	it('removes the project and the model, and replaces the skills', async () => {
		const { controller } = setup();
		await controller.create({ id: testScheduleId(), definition: named });

		await controller.update({
			scheduleId: testScheduleId(),
			changes: { projectId: null, model: null, skillNoteIds: [] }
		});

		expect(await controller.get({ scheduleId: testScheduleId() })).toEqual({
			schedule: scheduleBuilder()
		});
	});

	it('lets a skill that was turned off stay or go, but not be added', async () => {
		const { controller, start } = setup();
		const review = scheduleSkill(testNoteId(42), 'Weekly review');
		start.skills.skills = [scheduleSkill(), review];
		await controller.create({
			id: testScheduleId(),
			definition: { ...named, skillNoteIds: [testNoteId(41), testNoteId(42)] }
		});
		start.skills.skills = [{ ...scheduleSkill(), isEnabled: false }, review];
		const change = (skillNoteIds: readonly NoteId[]) =>
			controller.update({ scheduleId: testScheduleId(), changes: { skillNoteIds } });

		const kept = await change([testNoteId(41)]);
		const cleared = await change([]);
		const added = await change([testNoteId(41)]).catch((error: Error) => error.message);

		expect([kept.schedule.skillNoteIds, cleared.schedule.skillNoteIds, added]).toEqual([
			[testNoteId(41)],
			[],
			'A skill is turned off or does not exist. Choose another skill.'
		]);
	});

	it('pauses a schedule, then resumes it from the next occurrence after now', async () => {
		const { controller, clock } = setup();
		await controller.create({ id: testScheduleId(), definition });

		const paused = await controller.pause({ scheduleId: testScheduleId() });
		clock.now = '2026-11-18T12:00:00.000Z' as DateTime;
		const resumed = await controller.resume({ scheduleId: testScheduleId() });

		expect([paused, resumed]).toEqual([
			{ schedule: scheduleBuilder({ status: 'paused' }) },
			{
				schedule: scheduleBuilder({
					status: 'active',
					nextRunAt: '2026-11-19T07:00:00.000Z' as DateTime,
					updatedAt: clock.now
				})
			}
		]);
	});

	it('lets a schedule act without asking only through its own operation', async () => {
		const { controller } = setup();
		await controller.create({ id: testScheduleId(), definition });

		const changed = await controller.setExecutionMode({
			scheduleId: testScheduleId(),
			executionMode: 'auto_accept'
		});

		expect(changed).toEqual({
			schedule: scheduleBuilder({
				executionMode: 'auto_accept',
				status: 'active',
				nextRunAt: tuesdayRun
			})
		});
	});

	it('hides one user’s schedule from another user', async () => {
		const { controller, other } = setup();
		await controller.create({ id: testScheduleId(), definition });
		const target = { scheduleId: testScheduleId() };

		const attempts = await Promise.all([
			other.get(target).catch((error: Error) => error),
			other.pause(target).catch((error: Error) => error),
			other.remove(target).catch((error: Error) => error)
		]);

		expect([
			attempts.map((attempt) => attempt instanceof NotFoundError),
			await other.list(),
			await controller.list()
		]).toEqual([[true, true, true], { schedules: [] }, { schedules: [scheduleBuilder()] }]);
	});

	it('lists the runs a schedule started, newest first, with the state of each', async () => {
		const { controller, other, occurrences, runStatus } = setup();
		await controller.create({ id: testScheduleId(), definition });
		const run = (suffix: number, scheduledFor: string): ScheduleOccurrence => ({
			id: `5d000000-0000-4000-8000-00000000000${suffix}` as ScheduleOccurrenceId,
			userId: testActor().userId,
			scheduleId: testScheduleId(),
			trigger: 'recurrence',
			scheduledFor: scheduledFor as DateTime,
			conversationId: `33000000-0000-4000-8000-00000000000${suffix}` as ConversationId,
			runId: `32000000-0000-4000-8000-00000000000${suffix}` as AgentRunId,
			createdAt: scheduledFor as DateTime
		});
		const tuesday = run(1, '2026-11-17T07:00:00.000Z');
		const wednesday = run(2, '2026-11-18T07:00:00.000Z');
		await occurrences.insert(tuesday);
		await occurrences.insert(wednesday);
		runStatus.set(tuesday.runId, 'completed');
		runStatus.set(wednesday.runId, 'awaiting_approval');

		const listed = await controller.listRuns({ scheduleId: testScheduleId() });
		const foreign = await other
			.listRuns({ scheduleId: testScheduleId() })
			.catch((error: Error) => error);

		expect([listed, foreign instanceof NotFoundError]).toEqual([
			{
				runs: [
					{ ...wednesday, status: 'awaiting_approval' },
					{ ...tuesday, status: 'completed' }
				]
			},
			true
		]);
	});

	it('records when its owner opens a run, and refuses a run that is not theirs', async () => {
		const { controller, other, occurrences, clock } = setup();
		const occurrence: ScheduleOccurrence = {
			id: '5d000000-0000-4000-8000-000000000007' as ScheduleOccurrenceId,
			userId: testActor().userId,
			scheduleId: testScheduleId(),
			trigger: 'recurrence',
			scheduledFor: tuesdayRun,
			conversationId: '33000000-0000-4000-8000-000000000007' as ConversationId,
			runId: '32000000-0000-4000-8000-000000000007' as AgentRunId,
			createdAt: tuesdayRun
		};
		await occurrences.insert(occurrence);
		clock.now = '2026-11-17T09:30:00.000Z' as DateTime;

		await controller.markRunOpened({ occurrenceId: occurrence.id });
		const foreign = await other
			.markRunOpened({
				occurrenceId: '5d000000-0000-4000-8000-000000000099' as ScheduleOccurrenceId
			})
			.catch((error: Error) => error);

		expect([occurrences.occurrences, foreign instanceof NotFoundError]).toEqual([
			[{ ...occurrence, openedAt: '2026-11-17T09:30:00.000Z' }],
			true
		]);
	});

	it('removes a schedule', async () => {
		const { controller } = setup();
		await controller.create({ id: testScheduleId(), definition });

		await controller.remove({ scheduleId: testScheduleId() });

		expect(await controller.list()).toEqual({ schedules: [] });
	});
});
