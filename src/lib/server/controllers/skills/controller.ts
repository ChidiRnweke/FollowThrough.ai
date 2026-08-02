import type { ActorContext } from '$lib/models/identity';
import type {
	CreateSkillFromSelectionInput,
	CreateSkillFromSelectionOutput,
	CreateSkillInput,
	CreateSkillOutput,
	GetSkillViewInput,
	ListSkillsOutput,
	LoadSkillInput,
	RestoreSkillVersionInput,
	SkillView
} from '$lib/models/skills';
import type { NoteRevision } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { NoteCreator, SelectionAnchorCreator } from '$lib/server/services/notes/contracts';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type {
	SkillCreator,
	SkillFinder,
	SkillUsageLister,
	SkillUsageRecorder,
	SkillEditor,
	SkillVersionManager
} from '$lib/server/services/skills/contracts';

/**
 * Application boundary for skills: reading, creating, editing, and versioning the
 * skill notes the agent can load.
 *
 * Skills are just notes with extra metadata, so creation and versioning go through the
 * note subsystem; `get` is a pure read, while the agent-facing load also records usage.
 */
export interface SkillsController {
	/** List the user's skills, optionally scoped to a project. */
	list(actor: ActorContext, input?: { projectId?: ProjectId }): Promise<ListSkillsOutput>;
	/** Load a skill and its usage counts for the editor view. Read-only. */
	get(actor: ActorContext, input: GetSkillViewInput): Promise<SkillView>;
	/**
	 * Load a skill for the agent and record that it was used.
	 *
	 * Distinct from {@link get} because loading by the agent is a side effect: it writes
	 * a usage record linking the skill to the note it was applied against, which is what
	 * makes "which skills actually get used" observable later.
	 */
	loadForAgent(actor: ActorContext, input: LoadSkillInput): Promise<SkillView>;
	/** Create a new skill backed by a fresh note, in one transaction. */
	create(actor: ActorContext, input: CreateSkillInput): Promise<CreateSkillOutput>;
	/**
	 * Create a skill distilled from a text selection.
	 *
	 * Records provenance from the source selection first, so the new skill carries a
	 * traceable lineage back to the content it was extracted from.
	 */
	createFromSelection(
		actor: ActorContext,
		input: CreateSkillFromSelectionInput
	): Promise<CreateSkillFromSelectionOutput>;
	/** List the revision history of a skill's underlying note. */
	listVersions(actor: ActorContext, input: GetSkillViewInput): Promise<readonly NoteRevision[]>;
	/** Restore a skill to an earlier revision, in one transaction. */
	restoreVersion(actor: ActorContext, input: RestoreSkillVersionInput): Promise<SkillView>;
	/** Edit a skill's content, returning the refreshed view with its usage counts. */
	update(actor: ActorContext, input: Parameters<SkillEditor['update']>[1]): Promise<SkillView>;
	/** Serialize a skill into the compact form the agent consumes. */
	serialize(actor: ActorContext, input: GetSkillViewInput): Promise<string>;
	/** Pin or unpin a skill within a project so it is offered before unpinned ones. */
	setPinned(
		actor: ActorContext,
		input: { noteId: GetSkillViewInput['noteId']; projectId: ProjectId; pinned: boolean }
	): Promise<void>;
}
/** Everything the {@link SkillsController} needs, injected so it can be built and tested without real stores. */
export interface SkillsDependencies {
	skillFinder: SkillFinder;
	skillUsageLister: SkillUsageLister;
	skillUsageRecorder: SkillUsageRecorder;
	skillVersionManager: SkillVersionManager;
	skillEditor: SkillEditor;
	anchorCreator: SelectionAnchorCreator;
	skillCreator: SkillCreator;
	noteCreator: NoteCreator;
	provenanceRecorder: ProvenanceRecorder;
	transactionRunner: TransactionRunner;
}
export class Skills implements SkillsController {
	constructor(private readonly dependencies: SkillsDependencies) {}
	async list(actor: ActorContext, input?: { projectId?: ProjectId }): Promise<ListSkillsOutput> {
		return { skills: await this.dependencies.skillFinder.listAll(actor, input?.projectId) };
	}
	async get(actor: ActorContext, input: GetSkillViewInput): Promise<SkillView> {
		const [skill, usages] = await Promise.all([
			this.dependencies.skillFinder.load(actor, input.noteId),
			this.dependencies.skillUsageLister.list(actor, input.noteId)
		]);
		return { skill, usages };
	}
	async loadForAgent(actor: ActorContext, input: LoadSkillInput): Promise<SkillView> {
		const skill = await this.dependencies.skillFinder.load(actor, input.noteId);
		await this.dependencies.skillUsageRecorder.record(actor, {
			skillNoteId: input.noteId,
			contextNoteId: input.contextNoteId,
			provenanceId: input.provenanceId
		});
		return {
			skill,
			usages: await this.dependencies.skillUsageLister.list(actor, input.noteId)
		};
	}
	create(actor: ActorContext, input: CreateSkillInput): Promise<CreateSkillOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const note = await this.dependencies.noteCreator.create(actor, {
				title: input.name,
				projectId: input.projectId,
				parentId: input.parentId
			});
			const skill = await this.dependencies.skillCreator.create(actor, note, {
				name: input.name,
				description: input.description ?? '',
				triggerHints: input.triggerHints ?? []
			});
			return { skill };
		});
	}
	createFromSelection(
		actor: ActorContext,
		input: CreateSkillFromSelectionInput
	): Promise<CreateSkillFromSelectionOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const anchor = await this.dependencies.anchorCreator.create(actor, input.selection);
			const provenance = await this.dependencies.provenanceRecorder.record(actor, {
				producerKind: 'user',
				producerName: 'Create Skill From Selection',
				sourceAnchorId: anchor.id,
				metadata: {}
			});
			const skill = await this.dependencies.skillCreator.createFromSelection(
				actor,
				input.selection,
				{
					name: input.name,
					description: input.description,
					triggerHints: input.triggerHints,
					provenanceId: provenance.id
				}
			);
			return { skillNoteId: skill.note.id };
		});
	}
	listVersions(actor: ActorContext, input: GetSkillViewInput): Promise<readonly NoteRevision[]> {
		return this.dependencies.skillVersionManager.listVersions(actor, input.noteId);
	}
	async restoreVersion(actor: ActorContext, input: RestoreSkillVersionInput): Promise<SkillView> {
		const skill = await this.dependencies.transactionRunner.run(() =>
			this.dependencies.skillVersionManager.restoreVersion(actor, input.noteId, input.revision)
		);
		return {
			skill,
			usages: await this.dependencies.skillUsageLister.list(actor, input.noteId)
		};
	}
	async update(
		actor: ActorContext,
		input: Parameters<SkillEditor['update']>[1]
	): Promise<SkillView> {
		const skill = await this.dependencies.transactionRunner.run(() =>
			this.dependencies.skillEditor.update(actor, input)
		);
		return { skill, usages: await this.dependencies.skillUsageLister.list(actor, input.noteId) };
	}
	serialize(actor: ActorContext, input: GetSkillViewInput): Promise<string> {
		return this.dependencies.skillEditor.serialize(actor, input.noteId);
	}
	setPinned(
		actor: ActorContext,
		input: { noteId: GetSkillViewInput['noteId']; projectId: ProjectId; pinned: boolean }
	): Promise<void> {
		return this.dependencies.skillEditor.setPinned(
			actor,
			input.noteId,
			input.projectId,
			input.pinned
		);
	}
}
