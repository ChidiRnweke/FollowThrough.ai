import type { GenerateMermaidDiagramOutput } from '$lib/models/diagrams';
import type { ActorContext } from '$lib/models/identity';
import type { TextSelection } from '$lib/models/notes';
import type { FindReferencesOutput } from '$lib/models/references';
import type { RelateSelectionOutput } from '$lib/models/relationships';
import type { Suggestion } from '$lib/models/suggestions';
import type { ExtractPromisesOutput } from '$lib/models/todos';

export interface AgentWorkflowToolbox {
	extractPromises(
		actor: ActorContext,
		selection: TextSelection
	): Promise<ExtractPromisesOutput<Suggestion>>;
	relate(actor: ActorContext, selection: TextSelection): Promise<RelateSelectionOutput<Suggestion>>;
	reference(
		actor: ActorContext,
		selection: TextSelection
	): Promise<FindReferencesOutput<Suggestion>>;
	generateDiagram(
		actor: ActorContext,
		selection: TextSelection,
		instruction?: string
	): Promise<GenerateMermaidDiagramOutput<Suggestion>>;
}
