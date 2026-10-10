import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { NoteMarkdownWriter } from '$lib/server/controllers/notes/controller';
import type { SkillsController } from '$lib/server/controllers/skills/controller';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { McpToolContext } from '../tool-context';
import type { AgentToolOutput } from '../tool-outputs';
interface McpToolOperationsDependencies {
	skills(): Pick<SkillsController, 'loadForAgent'>;
}
export interface McpToolOperations {
	load_skill(fields: AgentToolInput<'load_skill'>): Promise<AgentToolOutput<'load_skill'>>;
}
export class McpToolOperationsController implements McpToolOperations {
	constructor(
		private readonly controllers: McpToolOperationsDependencies,
		private readonly actor: ActorContext,

		private readonly toolPresentation: AgentToolPresentation,
		private readonly noteMarkdown: NoteMarkdownWriter,
		private readonly context: McpToolContext
	) {}
	async load_skill(fields: AgentToolInput<'load_skill'>): Promise<AgentToolOutput<'load_skill'>> {
		const view = await this.controllers.skills().loadForAgent(this.actor, {
			noteId: fields.noteId as NoteId,
			provenanceId: this.context.provenanceId
		});
		return this.toolPresentation.projectSkillView(
			view,
			this.noteMarkdown.write(view.skill.note.document)
		);
	}
}
