import type {
	ActorContext,
	DiagramId,
	NoteId,
	ProjectId,
	SearchDocument,
	SearchMatch
} from '../models';
export interface RetrievalIndexRepository {
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly SearchDocument[]>;
	listForDiagram(actor: ActorContext, diagramId: DiagramId): Promise<readonly SearchDocument[]>;
	replaceForNote(
		actor: ActorContext,
		noteId: NoteId,
		documents: readonly SearchDocument[]
	): Promise<void>;
	replaceForDiagram(
		actor: ActorContext,
		diagramId: DiagramId,
		documents: readonly SearchDocument[]
	): Promise<void>;
	search(
		actor: ActorContext,
		query: string,
		limit: number,
		projectId?: ProjectId
	): Promise<readonly SearchMatch[]>;
	searchByEmbedding(
		actor: ActorContext,
		embedding: readonly number[],
		limit: number,
		projectId?: ProjectId
	): Promise<readonly SearchMatch[]>;
	deleteForNote(actor: ActorContext, noteId: NoteId): Promise<void>;
	deleteForDiagram(actor: ActorContext, diagramId: DiagramId): Promise<void>;
}
