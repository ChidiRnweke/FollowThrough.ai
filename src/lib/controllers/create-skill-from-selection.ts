import type {
	ActorContext,
	CreateSkillFromSelectionInput,
	CreateSkillFromSelectionOutput
} from '../models';
import type { TransactionRunner } from '../repositories';
import type { ProvenanceRecorder, SelectionAnchorCreator, SkillCreator } from '../services';

export interface CreateSkillFromSelectionDependencies {
	anchorCreator: SelectionAnchorCreator;
	skillCreator: SkillCreator;
	provenanceRecorder: ProvenanceRecorder;
	transactionRunner: TransactionRunner;
}

export class DefaultCreateSkillFromSelectionController {
	constructor(private readonly dependencies: CreateSkillFromSelectionDependencies) {}

	execute(
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
