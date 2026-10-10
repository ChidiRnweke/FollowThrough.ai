import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { ActorContext } from '$lib/models/identity';
import type { TextSelection } from '$lib/models/notes';
import type { ReferencesController } from '$lib/server/controllers/references/controller';
import type { RelationshipsController } from '$lib/server/controllers/relationships/controller';
import type { SkillsController } from '$lib/server/controllers/skills/controller';
import type { TodosController } from '$lib/server/controllers/todos/controller';
import type { AgentToolOutput } from '../tool-outputs';
interface SelectionToolOperationsDependencies {
	todos(): Pick<TodosController, 'extractPromises'>;
	relationships(): Pick<RelationshipsController, 'suggestFromSelection'>;
	references(): Pick<ReferencesController, 'suggestFromSelection'>;
	skills(): Pick<SkillsController, 'createFromSelection'>;
}
export interface SelectionToolOperations {
	extract_promises(
		fields: AgentToolInput<'extract_promises'>
	): Promise<AgentToolOutput<'extract_promises'>>;
	relate_selection(): Promise<AgentToolOutput<'relate_selection'>>;
	find_references(): Promise<AgentToolOutput<'find_references'>>;
	create_skill_from_selection(
		fields: AgentToolInput<'create_skill_from_selection'>
	): Promise<AgentToolOutput<'create_skill_from_selection'>>;
}
export class SelectionToolOperationsController implements SelectionToolOperations {
	constructor(
		private readonly controllers: SelectionToolOperationsDependencies,
		private readonly actor: ActorContext,
		private readonly selection: TextSelection,
		private readonly model: string
	) {}
	async extract_promises(
		fields: AgentToolInput<'extract_promises'>
	): Promise<AgentToolOutput<'extract_promises'>> {
		return {
			...(await this.controllers.todos().extractPromises(this.actor, {
				selection: this.selection,
				...(fields.responsibility ? { responsibility: fields.responsibility } : {})
			})),
			sourceNoteId: this.selection.noteId
		};
	}
	async relate_selection(): Promise<AgentToolOutput<'relate_selection'>> {
		return {
			...(await this.controllers
				.relationships()
				.suggestFromSelection(this.actor, { selection: this.selection })),
			sourceNoteId: this.selection.noteId
		};
	}
	async find_references(): Promise<AgentToolOutput<'find_references'>> {
		return {
			...(await this.controllers
				.references()
				.suggestFromSelection(this.actor, { selection: this.selection }, { model: this.model })),
			sourceNoteId: this.selection.noteId
		};
	}
	async create_skill_from_selection(
		fields: AgentToolInput<'create_skill_from_selection'>
	): Promise<AgentToolOutput<'create_skill_from_selection'>> {
		return {
			...(await this.controllers
				.skills()
				.createFromSelection(this.actor, { ...fields, selection: this.selection })),
			sourceNoteId: this.selection.noteId
		};
	}
}
