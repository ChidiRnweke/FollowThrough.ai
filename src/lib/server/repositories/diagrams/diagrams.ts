import type {
	Diagram,
	DiagramContentWrite,
	DiagramId,
	DiagramRevision,
	DiagramRevisionId,
	DrawioDiagram,
	ListProjectDiagramsOutput,
	ListProjectDiagramsParams
} from '$lib/models/diagrams';
import type { ConversationId } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
/** One repository for both diagram kinds; `Diagram` is the `MermaidDiagram | DrawioDiagram` union, distinguished by `kind`. */
export interface DiagramRepository {
	/** Lock the owned row within the caller transaction. */
	findForWrite(id: DiagramId): Promise<Diagram | undefined>;
	findById(id: DiagramId): Promise<Diagram | undefined>;
	/** The diagram a studio conversation produced, if it has been promoted yet. */
	findByConversation(conversationId: ConversationId): Promise<Diagram | undefined>;
	/**
	 * How many notes render this diagram.
	 *
	 * References live inside note documents rather than in a join table, so this
	 * reads the documents. It runs once, when a delete is being confirmed — not on
	 * any write path — which is why no index is maintained for it.
	 */
	countReferencingNotes(id: DiagramId): Promise<number>;
	listForNote(noteId: NoteId): Promise<readonly Diagram[]>;
	listForProject(
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
	countForProject(projectId: ProjectId, params?: ListProjectDiagramsParams): Promise<number>;
	insert(diagram: Diagram): Promise<Diagram>;
	updateContent(write: DiagramContentWrite): Promise<Diagram | undefined>;
	updateIfRevision(
		diagram: DrawioDiagram,
		expected: number,
		expectedPublishedRevision: number
	): Promise<DrawioDiagram | undefined>;
	insertRevision(revision: DiagramRevision): Promise<DiagramRevision>;
	listRevisions(id: DiagramId): Promise<readonly DiagramRevision[]>;
	findRevision(id: DiagramId, revisionId: DiagramRevisionId): Promise<DiagramRevision | undefined>;
	/** Atomically refuse deletion if a concurrent restore made the diagram active. */
	deleteArchived(id: DiagramId): Promise<boolean>;
	/** Persist resolved trash fields without replacing diagram content. */
	updateTrash(diagram: Diagram): Promise<Diagram>;
	listArchived(projectId?: ProjectId): Promise<readonly Diagram[]>;
}
