import type { WidgetId } from '$lib/models/widgets';
import type { IndexSource, PendingIndexSource, EmbeddedChunk } from '$lib/models/knowledge-search';
import type { DiagramId } from '$lib/models/diagrams';
import type { MemoryEntryId } from '$lib/models/memory';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { SearchDocument, SearchMatch } from '$lib/models/knowledge-search';
import type { AttachmentId } from '$lib/models/attachments';

/**
 * Identifies the thing a set of chunks was derived from. Every chunk belongs to
 * exactly one source, and staging, completion, and deletion are all scoped by it.
 * Diagram chunks also carry their note, so `note` deliberately excludes them.
 */
export type { IndexSource, PendingIndexSource, EmbeddedChunk } from '$lib/models/knowledge-search';
import type { CreatedRange, SearchFilter } from '$lib/models/knowledge-search';
export type { CreatedRange, SearchFilter } from '$lib/models/knowledge-search';

export interface RetrievalIndexRepository {
	listForAttachment(attachmentId: AttachmentId): Promise<readonly SearchDocument[]>;
	replaceForAttachment(
		attachmentId: AttachmentId,
		documents: readonly SearchDocument[]
	): Promise<void>;
	deleteForAttachment(attachmentId: AttachmentId): Promise<void>;
	listForNote(noteId: NoteId): Promise<readonly SearchDocument[]>;
	listForDiagram(diagramId: DiagramId): Promise<readonly SearchDocument[]>;
	listForWidget(widgetId: WidgetId): Promise<readonly SearchDocument[]>;
	listForMemoryEntry(memoryEntryId: MemoryEntryId): Promise<readonly SearchDocument[]>;
	replaceForNote(noteId: NoteId, documents: readonly SearchDocument[]): Promise<void>;
	replaceForDiagram(diagramId: DiagramId, documents: readonly SearchDocument[]): Promise<void>;
	replaceForMemoryEntry(
		memoryEntryId: MemoryEntryId,
		documents: readonly SearchDocument[]
	): Promise<void>;
	search(
		query: string,
		limit: number,
		projectId?: ProjectId,
		created?: CreatedRange
	): Promise<readonly SearchMatch[]>;
	searchByEmbedding(
		embedding: readonly number[],
		limit: number,
		projectId?: ProjectId,
		filter?: SearchFilter
	): Promise<readonly SearchMatch[]>;
	deleteForNote(noteId: NoteId): Promise<void>;
	deleteForDiagram(diagramId: DiagramId): Promise<void>;
	deleteForWidget(widgetId: WidgetId): Promise<void>;
	deleteForMemoryEntry(memoryEntryId: MemoryEntryId): Promise<void>;

	/**
	 * Writes the desired chunk set for a source without requiring embeddings.
	 * Documents carrying no vector land as pending; previously embedded rows the
	 * new set no longer mentions are marked superseded rather than deleted, so
	 * semantic search keeps answering from them until the backfill worker catches
	 * up. Prior rows that were themselves still pending are dropped outright —
	 * nothing depends on them.
	 */
	stage(source: IndexSource, documents: readonly SearchDocument[]): Promise<void>;

	/** The chunks of one source that still need vectors. */
	listPending(source: IndexSource): Promise<readonly SearchDocument[]>;

	/**
	 * Attaches vectors to pending chunks and, once the source has no pending
	 * chunks left, retires the superseded rows it was holding for continuity.
	 */
	completePending(
		source: IndexSource,
		embedded: readonly EmbeddedChunk[],
		embeddingModel: string
	): Promise<void>;
}

/** Index sources waiting for vectors across every user, for the worker. */
export interface RetrievalBacklogRepository {
	/** Pending sources in stable account/source order, strictly after the supplied cursor. */
	listPendingSources(limit: number, after?: string): Promise<readonly PendingIndexSource[]>;
}
