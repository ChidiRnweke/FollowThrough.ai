import { ValidationError } from '$lib/errors';
import type { AgentExecutionMode } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type {
	Schedule,
	ScheduleChanges,
	ScheduleDecision,
	ScheduleDefinition,
	ScheduleId
} from '$lib/models/schedules';
import type { AtomicOperation, DateTime } from '$lib/models/workspace';
import type { ScheduleReader, ScheduleWriter } from '$lib/server/services/schedules/library';
import type { ScheduleEdits } from '$lib/services/schedules/rules';

/**
 * Application boundary for a user's schedules (ADR 0052). Every change is decided by the shared
 * schedule rules against the locked current schedule, so the next run a browser previews is the
 * next run that is saved.
 */
export interface SchedulesController {
	list(): Promise<{ schedules: readonly Schedule[] }>;
	get(input: { readonly scheduleId: ScheduleId }): Promise<{ schedule: Schedule }>;
	/** @throws ValidationError if the recurrence has no occurrence in the future. */
	create(input: {
		readonly id: ScheduleId;
		readonly definition: ScheduleDefinition;
	}): Promise<{ schedule: Schedule }>;
	/** @throws ValidationError if the changed recurrence has no occurrence in the future. */
	update(input: {
		readonly scheduleId: ScheduleId;
		readonly changes: ScheduleChanges;
	}): Promise<{ schedule: Schedule }>;
	pause(input: { readonly scheduleId: ScheduleId }): Promise<{ schedule: Schedule }>;
	/** @throws ValidationError if the schedule has no occurrence in the future. */
	resume(input: { readonly scheduleId: ScheduleId }): Promise<{ schedule: Schedule }>;
	/** Whether the schedule's runs ask before a change. */
	setExecutionMode(input: {
		readonly scheduleId: ScheduleId;
		readonly executionMode: AgentExecutionMode;
	}): Promise<{ schedule: Schedule }>;
	remove(input: { readonly scheduleId: ScheduleId }): Promise<void>;
}

export interface SchedulesDependencies {
	/** The process clock, shared by every capability that stamps time. */
	readonly now: () => DateTime;
	readonly rules: ScheduleEdits;
	readonly reader: ScheduleReader;
	readonly writer: ScheduleWriter;
	readonly transactionRunner: AtomicOperation;
}

/** The decided schedule, or the domain failure the caller reports. */
const decided = (decision: ScheduleDecision): Schedule => {
	switch (decision.kind) {
		case 'scheduled':
			return decision.schedule;
		case 'no_future_occurrence':
			throw new ValidationError(
				'This schedule has no run in the future. Choose a later date and time.'
			);
	}
};

export class Schedules implements SchedulesController {
	constructor(
		private readonly actor: ActorContext,
		private readonly dependencies: SchedulesDependencies
	) {}

	async list(): Promise<{ schedules: readonly Schedule[] }> {
		return { schedules: await this.dependencies.reader.list() };
	}

	async get(input: { readonly scheduleId: ScheduleId }): Promise<{ schedule: Schedule }> {
		return { schedule: await this.dependencies.reader.get(input.scheduleId) };
	}

	async create(input: {
		readonly id: ScheduleId;
		readonly definition: ScheduleDefinition;
	}): Promise<{ schedule: Schedule }> {
		const schedule = decided(
			this.dependencies.rules.create(
				input.definition,
				{ id: input.id, userId: this.actor.userId },
				this.dependencies.now()
			)
		);
		return { schedule: await this.dependencies.writer.create(schedule) };
	}

	update(input: {
		readonly scheduleId: ScheduleId;
		readonly changes: ScheduleChanges;
	}): Promise<{ schedule: Schedule }> {
		return this.change(input.scheduleId, (current, now) =>
			decided(this.dependencies.rules.change(current, input.changes, now))
		);
	}

	pause(input: { readonly scheduleId: ScheduleId }): Promise<{ schedule: Schedule }> {
		return this.change(input.scheduleId, (current, now) =>
			this.dependencies.rules.pause(current, now)
		);
	}

	resume(input: { readonly scheduleId: ScheduleId }): Promise<{ schedule: Schedule }> {
		return this.change(input.scheduleId, (current, now) =>
			decided(this.dependencies.rules.resume(current, now))
		);
	}

	setExecutionMode(input: {
		readonly scheduleId: ScheduleId;
		readonly executionMode: AgentExecutionMode;
	}): Promise<{ schedule: Schedule }> {
		return this.change(input.scheduleId, (current, now) =>
			this.dependencies.rules.withExecutionMode(current, input.executionMode, now)
		);
	}

	async remove(input: { readonly scheduleId: ScheduleId }): Promise<void> {
		await this.dependencies.writer.remove(input.scheduleId);
	}

	private change(
		scheduleId: ScheduleId,
		decide: (current: Schedule, now: DateTime) => Schedule
	): Promise<{ schedule: Schedule }> {
		return this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.writer.getForChange(scheduleId);
			return {
				schedule: await this.dependencies.writer.save(decide(current, this.dependencies.now()))
			};
		});
	}
}
