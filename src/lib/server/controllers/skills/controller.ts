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

export interface SkillsController {
	list(actor: ActorContext, input?: { projectId?: ProjectId }): Promise<ListSkillsOutput>;
	get(actor: ActorContext, input: GetSkillViewInput): Promise<SkillView>;
	loadForAgent(actor: ActorContext, input: LoadSkillInput): Promise<SkillView>;
	create(actor: ActorContext, input: CreateSkillInput): Promise<CreateSkillOutput>;
	createFromSelection(
		actor: ActorContext,
		input: CreateSkillFromSelectionInput
	): Promise<CreateSkillFromSelectionOutput>;
	listVersions(actor: ActorContext, input: GetSkillViewInput): Promise<readonly NoteRevision[]>;
	restoreVersion(actor: ActorContext, input: RestoreSkillVersionInput): Promise<SkillView>;
	update(actor: ActorContext, input: Parameters<SkillEditor['update']>[1]): Promise<SkillView>;
	serialize(actor: ActorContext, input: GetSkillViewInput): Promise<string>;
	setPinned(
		actor: ActorContext,
		input: { noteId: GetSkillViewInput['noteId']; projectId: ProjectId; pinned: boolean }
	): Promise<void>;
}
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
