import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { DiagramStudioController } from '$lib/server/controllers/diagram-studio/controller';
import type { NoteMarkdown } from '$lib/server/controllers/notes/controller';
import type { SkillsController } from '$lib/server/controllers/skills/controller';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { AgentProjectChoice } from '../project-choice';
import type { AgentToolContext } from '../tool-context';
import type { AgentToolOutput } from '../tool-outputs';
interface AppToolOperationsDependencies {
	skills(): Pick<SkillsController, 'loadForAgent'>;
	diagramStudio(): Pick<
		DiagramStudioController,
		'createDiagram' | 'editDiagram' | 'readCanvasDiagram'
	>;
}
export interface AppToolOperations {
	load_skill(fields: AgentToolInput<'load_skill'>): Promise<AgentToolOutput<'load_skill'>>;
	create_diagram(
		fields: AgentToolInput<'create_diagram'>
	): Promise<AgentToolOutput<'create_diagram'>>;
	edit_diagram(fields: AgentToolInput<'edit_diagram'>): Promise<AgentToolOutput<'edit_diagram'>>;
	read_canvas_diagram(): Promise<AgentToolOutput<'read_canvas_diagram'>>;
}
export class AppToolOperationsController implements AppToolOperations {
	constructor(
		private readonly controllers: AppToolOperationsDependencies,
		private readonly actor: ActorContext,

		private readonly toolPresentation: AgentToolPresentation,
		private readonly noteMarkdown: NoteMarkdown,
		private readonly context: AgentToolContext,
		private readonly projectChoice: AgentProjectChoice
	) {}
	async load_skill(fields: AgentToolInput<'load_skill'>): Promise<AgentToolOutput<'load_skill'>> {
		const view = await this.controllers.skills().loadForAgent(this.actor, {
			noteId: fields.noteId as NoteId,
			contextNoteId: this.context.input.noteId,
			provenanceId: this.context.provenanceId
		});
		return this.toolPresentation.projectSkillView(
			view,
			this.noteMarkdown.write(view.skill.note.document)
		);
	}
	async create_diagram(
		fields: AgentToolInput<'create_diagram'>
	): Promise<AgentToolOutput<'create_diagram'>> {
		const chosenProjectId =
			fields.projectId ?? (await this.projectChoice.requireChoice(this.actor, 'create a diagram'));
		return this.controllers.diagramStudio().createDiagram(this.actor, {
			source: fields.source,
			projectId: chosenProjectId,
			conversationId: this.context.input.conversationId,
			...(fields.title === undefined ? {} : { title: fields.title })
		});
	}
	async edit_diagram(
		fields: AgentToolInput<'edit_diagram'>
	): Promise<AgentToolOutput<'edit_diagram'>> {
		return this.controllers.diagramStudio().editDiagram(this.actor, fields);
	}
	async read_canvas_diagram(): Promise<AgentToolOutput<'read_canvas_diagram'>> {
		return this.controllers.diagramStudio().readCanvasDiagram(this.actor, {
			conversationId: this.context.input.conversationId
		});
	}
}
