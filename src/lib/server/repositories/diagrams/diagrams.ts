import type { ActorContext } from '$lib/models/identity';
import type {
	Diagram,
	DiagramId,
	ListProjectDiagramsOutput,
	ListProjectDiagramsParams
} from '$lib/models/diagrams';
import type { ConversationId } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
/** One repository for both diagram kinds; `Diagram` is the `MermaidDiagram | DrawioDiagram` union, distinguished by `kind`. */
export interface DiagramRepository {
	findById(actor: ActorContext, id: DiagramId): Promise<Diagram | undefined>;
	/** The diagram a studio conversation produced, if it has been promoted yet. */
	findByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<Diagram | undefined>;
	/**
	 * How many notes render this diagram.
	 *
	 * References live inside note documents rather than in a join table, so this
	 * reads the documents. It runs once, when a delete is being confirmed — not on
	 * any write path — which is why no index is maintained for it.
	 */
	countReferencingNotes(actor: ActorContext, id: DiagramId): Promise<number>;
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly Diagram[]>;
	listForProject(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListProjectDiagramsParams
	): Promise<ListProjectDiagramsOutput>;
	/**
	 * How many diagrams a project holds, for a screen that shows only the number.
	 *
	 * Its own query rather than a `listForProject` whose limit happens to be zero:
	 * that read as "ask for no rows and use the total", an unwritten convention
	 * every implementation had to know to honour.
	 */
	countForProject(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListProjectDiagramsParams
	): Promise<number>;
	insert(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
	update(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
	delete(actor: ActorContext, id: DiagramId): Promise<void>;
}
