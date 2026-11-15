import { NotFoundError, ValidationError } from '$lib/errors';
import type { AgentExecutionMode } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type {
	Schedule,
	ScheduleChanges,
	ScheduleDecision,
	ScheduleDefinition,
	ScheduleId,
	ScheduleOccurrenceId,
	ScheduleRun
} from '$lib/models/schedules';
import type { AtomicOperation, DateTime } from '$lib/models/workspace';
import type { AgentModelCatalog } from '$lib/server/services/agent/runs/preferences';
import type { ProjectReader } from '$lib/server/services/projects/catalog';
import type { ScheduleReader, ScheduleWriter } from '$lib/server/services/schedules/library';
import type { ScheduleRunOpening, ScheduleRunReader } from '$lib/server/services/schedules/runs';
import type { SkillFinder } from '$lib/server/services/skills/library';
import type {
	IAgentModelChoiceService,
	IAgentModelSelectionService
} from '$lib/services/agent/model-selection';
import type { ScheduleEdits } from '$lib/services/schedules/rules';

/**
 * Application boundary for a user's schedules (ADR 0052). Every change is decided by the shared
 * schedule rules against the locked current schedule, so the next run a browser previews is the
 * next run that is saved.
 */
export interface SchedulesController {
	list(): Promise<{ schedules: readonly Schedule[] }>;
	get(input: { readonly scheduleId: ScheduleId }): Promise<{ schedule: Schedule }>;
	/**
	 * The runs a schedule has started, newest first, each with the state of its agent run.
	 * @throws NotFoundError if the actor has no such schedule.
	 */
	listRuns(input: { readonly scheduleId: ScheduleId }): Promise<{ runs: readonly ScheduleRun[] }>;
	/**
	 * @throws ValidationError if the recurrence has no occurrence in the future, or if the
	 * definition names a model that is not offered, a project the actor cannot use, or a skill
	 * that is not turned on.
	 */
	create(input: {
		readonly id: ScheduleId;
		readonly definition: ScheduleDefinition;
	}): Promise<{ schedule: Schedule }>;
	/**
	 * Only what the changes state is checked, so a schedule can still be renamed when the model
	 * it names has left the catalog.
	 * @throws ValidationError if the changed recurrence has no occurrence in the future, or if
	 * the changes name a model that is not offered, a project the actor cannot use, or a skill
	 * that is not turned on.
	 */
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
	/**
	 * Records that the owner has opened the chat of one run, so it no longer counts as unopened.
	 * @throws NotFoundError if the actor has no such run.
	 */
	markRunOpened(input: { readonly occurrenceId: ScheduleOccurrenceId }): Promise<void>;
}

export interface SchedulesDependencies {
	/** The process clock, shared by every capability that stamps time. */
	readonly now: () => DateTime;
	readonly rules: ScheduleEdits;
	readonly reader: ScheduleReader;
	readonly writer: ScheduleWriter;
	readonly runs: ScheduleRunReader & ScheduleRunOpening;
	readonly transactionRunner: AtomicOperation;
	/** The catalog a schedule's model is checked against when it is saved. */
	readonly models: AgentModelCatalog;
	readonly modelChoices: IAgentModelChoiceService;
	readonly modelSelection: IAgentModelSelectionService;
	readonly defaultModel: string;
	readonly defaultVisionModel: string;
	readonly projects: ProjectReader;
	readonly skills: Pick<SkillFinder, 'listEnabled'>;
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

	async listRuns(input: {
		readonly scheduleId: ScheduleId;
	}): Promise<{ runs: readonly ScheduleRun[] }> {
		await this.dependencies.reader.get(input.scheduleId);
		return { runs: await this.dependencies.runs.list(input.scheduleId) };
	}

	async create(input: {
		readonly id: ScheduleId;
		readonly definition: ScheduleDefinition;
	}): Promise<{ schedule: Schedule }> {
		const { model, projectId, skillNoteIds } = input.definition;
		if (model) await this.requireModel(model);
		if (projectId) await this.requireProject(projectId);
		await this.requireSkills(skillNoteIds);
		const schedule = decided(
			this.dependencies.rules.create(
				input.definition,
				{ id: input.id, userId: this.actor.userId },
				this.dependencies.now()
			)
		);
		return { schedule: await this.dependencies.writer.create(schedule) };
	}

	async update(input: {
		readonly scheduleId: ScheduleId;
		readonly changes: ScheduleChanges;
	}): Promise<{ schedule: Schedule }> {
		const { model, projectId, skillNoteIds } = input.changes;
		// The catalog is read from the provider, so it is read before the schedule is locked.
		if (model) await this.requireModel(model);
		return this.change(input.scheduleId, async (current, now) => {
			if (projectId) await this.requireProject(projectId);
			// Only the skills this change adds: one that was turned off since must stay removable
			// one chip at a time, and its run already says that it is gone.
			if (skillNoteIds)
				await this.requireSkills(
					skillNoteIds.filter((noteId) => !current.skillNoteIds.includes(noteId))
				);
			return decided(this.dependencies.rules.change(current, input.changes, now));
		});
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

	async markRunOpened(input: { readonly occurrenceId: ScheduleOccurrenceId }): Promise<void> {
		await this.dependencies.runs.opened(input.occurrenceId, this.dependencies.now());
	}

	private change(
		scheduleId: ScheduleId,
		decide: (current: Schedule, now: DateTime) => Schedule | Promise<Schedule>
	): Promise<{ schedule: Schedule }> {
		return this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.writer.getForChange(scheduleId);
			return {
				schedule: await this.dependencies.writer.save(
					await decide(current, this.dependencies.now())
				)
			};
		});
	}

	private async requireModel(model: string): Promise<void> {
		const { modelChoices, modelSelection } = this.dependencies;
		const selectable = modelChoices.configuredAgentModels(await this.dependencies.models.list(), {
			chatModelId: modelSelection.resolveDefaultAgentModel({}, this.dependencies.defaultModel),
			visionModelId: modelSelection.resolveDefaultVisionModel(
				{},
				this.dependencies.defaultVisionModel
			)
		});
		const issue = modelChoices.modelChoiceIssue(selectable, model, 'chat');
		if (issue) throw new ValidationError(issue);
	}

	private async requireProject(projectId: ProjectId): Promise<void> {
		try {
			await this.dependencies.projects.get(projectId);
		} catch (error) {
			if (!(error instanceof NotFoundError)) throw error;
			throw new ValidationError(
				'This project is archived or does not exist. Choose another project.'
			);
		}
	}

	private async requireSkills(noteIds: readonly NoteId[]): Promise<void> {
		if (noteIds.length === 0) return;
		const enabled = new Set(
			(await this.dependencies.skills.listEnabled()).map((skill) => skill.noteId)
		);
		if (noteIds.some((named) => !enabled.has(named)))
			throw new ValidationError('A skill is turned off or does not exist. Choose another skill.');
	}
}
