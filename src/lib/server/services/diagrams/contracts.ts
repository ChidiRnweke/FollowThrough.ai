import type { DiagramIndexContext, IndexingResult } from '$lib/models/knowledge-search';
import type { ActorContext } from '$lib/models/identity';
import type { Diagram } from '$lib/models/diagrams';
export interface DiagramIndexer {
	index(
		actor: ActorContext,
		diagram: Diagram,
		context: DiagramIndexContext
	): Promise<IndexingResult>;
}
