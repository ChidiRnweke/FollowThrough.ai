import type {
	ActorContext,
	CreateSkillFromSelectionInput,
	CreateSkillFromSelectionOutput,
	GetSkillViewInput,
	ListSkillsOutput,
	SkillView
} from '$lib/models';
import type { TransactionRunner } from '$lib/repositories';
import type {
	ProvenanceRecorder,
	SelectionAnchorCreator,
	SkillCreator,
	SkillFinder,
	SkillUsageLister
} from '$lib/services';

export interface SkillsController {
	list(actor: ActorContext): Promise<ListSkillsOutput>;
	get(actor: ActorContext, input: GetSkillViewInput): Promise<SkillView>;
	createFromSelection(
		actor: ActorContext,
		input: CreateSkillFromSelectionInput
	): Promise<CreateSkillFromSelectionOutput>;
}
export interface SkillsDependencies {
	skillFinder: SkillFinder;
	skillUsageLister: SkillUsageLister;
	anchorCreator: SelectionAnchorCreator;
	skillCreator: SkillCreator;
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
}
