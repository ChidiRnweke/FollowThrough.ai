import type {
	ActorContext,
	CreateSkillFromSelectionInput,
	CreateSkillFromSelectionOutput,
	CreateSkillInput,
	CreateSkillOutput,
	GetSkillViewInput,
	ListSkillsOutput,
	LoadSkillInput,
	NoteRevision,
	RestoreSkillVersionInput,
	SkillView
} from '$lib/models';
import type { TransactionRunner } from '$lib/repositories';
import type {
	NoteCreator,
	ProvenanceRecorder,
	SelectionAnchorCreator,
	SkillCreator,
	SkillFinder,
	SkillUsageLister,
	SkillUsageRecorder,
	SkillVersionManager
} from '$lib/services';

export interface SkillsController {
	list(actor: ActorContext): Promise<ListSkillsOutput>;
	get(actor: ActorContext, input: GetSkillViewInput): Promise<SkillView>;
	loadForAgent(actor: ActorContext, input: LoadSkillInput): Promise<SkillView>;
	create(actor: ActorContext, input: CreateSkillInput): Promise<CreateSkillOutput>;
	createFromSelection(
		actor: ActorContext,
		input: CreateSkillFromSelectionInput
	): Promise<CreateSkillFromSelectionOutput>;
	listVersions(actor: ActorContext, input: GetSkillViewInput): Promise<readonly NoteRevision[]>;
	restoreVersion(actor: ActorContext, input: RestoreSkillVersionInput): Promise<SkillView>;
}
export interface SkillsDependencies {
	skillFinder: SkillFinder;
	skillUsageLister: SkillUsageLister;
	skillUsageRecorder: SkillUsageRecorder;
	skillVersionManager: SkillVersionManager;
	anchorCreator: SelectionAnchorCreator;
	skillCreator: SkillCreator;
	noteCreator: NoteCreator;
	provenanceRecorder: ProvenanceRecorder;
	transactionRunner: TransactionRunner;
}
export class DefaultSkillsController implements SkillsController {
	constructor(private readonly dependencies: SkillsDependencies) {}
	async list(actor: ActorContext): Promise<ListSkillsOutput> {
		return { skills: await this.dependencies.skillFinder.listEnabled(actor) };
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
}
