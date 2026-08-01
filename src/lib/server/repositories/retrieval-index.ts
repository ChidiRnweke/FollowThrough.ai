import type {
	ActorContext,
	DiagramId,
	MemoryEntryId,
	NoteId,
	ProjectId,
	SearchDocument,
	SearchDocumentId,
	AttachmentId,
	SearchMatch,
	UserId
} from '$lib/models';

/**
 * Identifies the thing a set of chunks was derived from. Every chunk belongs to
 * exactly one source, and staging, completion, and deletion are all scoped by it.
 * Diagram chunks also carry their note, so `note` deliberately excludes them.
 */
export type IndexSource =
	| { readonly kind: 'note'; readonly noteId: NoteId }
	| { readonly kind: 'diagram'; readonly diagramId: DiagramId }
	| { readonly kind: 'memory'; readonly memoryEntryId: MemoryEntryId }
	| { readonly kind: 'attachment'; readonly attachmentId: AttachmentId };

/** A source with chunks awaiting embeddings, as discovered by the backfill worker. */
export interface PendingIndexSource {
	readonly userId: UserId;
	readonly source: IndexSource;
}

/** One chunk's freshly computed vector, ready to be written back. */
export interface EmbeddedChunk {
	readonly id: SearchDocumentId;
	readonly embedding: readonly number[];
}
export interface CreatedRange {
	readonly createdAfter?: string;
	readonly createdBefore?: string;
}

export interface RetrievalIndexRepository {
	listForAttachment(
		actor: ActorContext,
		attachmentId: AttachmentId
	): Promise<readonly SearchDocument[]>;
	replaceForAttachment(
		actor: ActorContext,
		attachmentId: AttachmentId,
		documents: readonly SearchDocument[]
	): Promise<void>;
	deleteForAttachment(actor: ActorContext, attachmentId: AttachmentId): Promise<void>;
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly SearchDocument[]>;
	listForDiagram(actor: ActorContext, diagramId: DiagramId): Promise<readonly SearchDocument[]>;
	listForMemoryEntry(
		actor: ActorContext,
		memoryEntryId: MemoryEntryId
	): Promise<readonly SearchDocument[]>;
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
	replaceForMemoryEntry(
		actor: ActorContext,
		memoryEntryId: MemoryEntryId,
		documents: readonly SearchDocument[]
	): Promise<void>;
	search(
		actor: ActorContext,
		query: string,
		limit: number,
		projectId?: ProjectId,
		created?: CreatedRange
	): Promise<readonly SearchMatch[]>;
	searchByEmbedding(
		actor: ActorContext,
		embedding: readonly number[],
		limit: number,
		projectId?: ProjectId,
		created?: CreatedRange
	): Promise<readonly SearchMatch[]>;
	deleteForNote(actor: ActorContext, noteId: NoteId): Promise<void>;
	deleteForDiagram(actor: ActorContext, diagramId: DiagramId): Promise<void>;
	deleteForMemoryEntry(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<void>;

	/**
	 * Writes the desired chunk set for a source without requiring embeddings.
	 * Documents carrying no vector land as pending; previously embedded rows the
	 * new set no longer mentions are marked superseded rather than deleted, so
	 * semantic search keeps answering from them until the backfill worker catches
	 * up. Prior rows that were themselves still pending are dropped outright —
	 * nothing depends on them.
	 */
	stage(
		actor: ActorContext,
		source: IndexSource,
		documents: readonly SearchDocument[]
	): Promise<void>;

	/** Sources holding at least one chunk without an embedding, oldest staged first. */
	listPendingSources(limit: number): Promise<readonly PendingIndexSource[]>;

	/** The chunks of one source that still need vectors. */
	listPending(actor: ActorContext, source: IndexSource): Promise<readonly SearchDocument[]>;

	/**
	 * Attaches vectors to pending chunks and, once the source has no pending
	 * chunks left, retires the superseded rows it was holding for continuity.
	 */
	completePending(
		actor: ActorContext,
		source: IndexSource,
		embedded: readonly EmbeddedChunk[],
		embeddingModel: string
	): Promise<void>;
}
