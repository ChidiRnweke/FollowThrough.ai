import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { ActorContext } from '$lib/models/identity';
import type { DiagramStudioController } from '$lib/server/controllers/diagram-studio/controller';
import type { DiagramsController } from '$lib/server/controllers/diagrams/controller';
import type { AgentToolOutput } from '../tool-outputs';
interface DiagramsToolOperationsDependencies {
	diagrams(): Pick<DiagramsController, 'reviseMermaid' | 'promote'>;
	diagramStudio(): Pick<DiagramStudioController, 'searchDiagramIcons' | 'readProjectDiagram'>;
}
export interface DiagramsToolOperations {
	revise_mermaid_diagram(
		input: AgentToolInput<'revise_mermaid_diagram'>
	): Promise<AgentToolOutput<'revise_mermaid_diagram'>>;
	search_icons(input: AgentToolInput<'search_icons'>): Promise<AgentToolOutput<'search_icons'>>;
	read_project_diagram(
		input: AgentToolInput<'read_project_diagram'>
	): Promise<AgentToolOutput<'read_project_diagram'>>;
	promote_diagram(
		input: AgentToolInput<'promote_diagram'>
	): Promise<AgentToolOutput<'promote_diagram'>>;
}
export class DiagramsToolOperationsController implements DiagramsToolOperations {
	constructor(
		private readonly controllers: DiagramsToolOperationsDependencies,
		private readonly actor: ActorContext
	) {}
	async revise_mermaid_diagram(
		input: AgentToolInput<'revise_mermaid_diagram'>
	): Promise<AgentToolOutput<'revise_mermaid_diagram'>> {
		return this.controllers.diagrams().reviseMermaid(this.actor, input);
	}
	async search_icons(
		input: AgentToolInput<'search_icons'>
	): Promise<AgentToolOutput<'search_icons'>> {
		return this.controllers.diagramStudio().searchDiagramIcons(this.actor, input);
	}
	async read_project_diagram(
		input: AgentToolInput<'read_project_diagram'>
	): Promise<AgentToolOutput<'read_project_diagram'>> {
		const diagram = await this.controllers.diagramStudio().readProjectDiagram(this.actor, input);
		return {
			id: diagram.id,
			kind: diagram.kind,
			...(diagram.title ? { title: diagram.title } : {}),
			labels: diagram.labels,
			path: `/projects/${diagram.projectId}/diagrams/${diagram.id}.${diagram.kind === 'mermaid' ? 'mmd' : 'drawio'}`
		};
	}
	async promote_diagram(
		input: AgentToolInput<'promote_diagram'>
	): Promise<AgentToolOutput<'promote_diagram'>> {
		return this.controllers.diagrams().promote(this.actor, input);
	}
}
