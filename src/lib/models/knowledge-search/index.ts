import { z } from 'zod';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

type DiagramId = Brand<string, 'DiagramId'>;

type WidgetId = Brand<string, 'WidgetId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

export type SearchDocumentId = Brand<string, 'SearchDocumentId'>;

/** A source whose stored chunks still need embeddings. */
export interface PendingIndexSource {
	readonly userId: Brand<string, 'UserId'>;
	readonly source: IndexSource;
	readonly cursor: string;
}

/** A created-at window on retrieval. */
export interface CreatedRange {
	readonly createdAfter?: string;
	readonly createdBefore?: string;
}

/**
 * Retrieval scoping beyond the project: a created-at window and, for note-scoped search (the
 * agent's search_note tool), a single note. Diagram chunks carry their note's id, so a note
 * filter includes them.
 */
export interface SearchFilter extends CreatedRange {
	readonly noteId?: NoteId;
}

/** Where a knowledge search looks and how many results it returns. */
export interface RetrievalScope {
	readonly limit: number;
	readonly projectId?: ProjectId;
	readonly filter?: SearchFilter;
	readonly signal?: AbortSignal;
}

/** Vectors computed for a source's pending chunks, ready to be stored. */
export interface EmbeddedSource {
	readonly source: IndexSource;
	readonly chunks: readonly EmbeddedChunk[];
	readonly model: string;
}

/** The provider's rerank endpoint. */
export interface RerankEndpoint {
	readonly url: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly fetch: typeof globalThis.fetch;
}

export interface EmbeddedChunk {
	readonly id: SearchDocumentId;
	readonly embedding: readonly number[];
}

export const searchDocumentIdSchema = z.uuid().transform((value) => value as SearchDocumentId);

type AttachmentId = Brand<string, 'AttachmentId'>;

type MemoryEntryId = Brand<string, 'MemoryEntryId'>;

type DateTime = Brand<string, 'DateTime'>;

export interface SearchDocument {
	readonly id: SearchDocumentId;
	readonly projectId: ProjectId;
	readonly noteId?: NoteId;
	readonly memoryEntryId?: MemoryEntryId;
	readonly attachmentId?: AttachmentId;
	readonly attachmentPath?: string;
	readonly sourceTitle?: string;
	readonly sectionPath?: string;
	readonly diagramId?: DiagramId;
	readonly widgetId?: WidgetId;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly content: string;
	readonly contentHash: string;
	readonly sourceRevision: number;
	readonly sourceCreatedAt?: DateTime;
	readonly chunkIndex: number;
	readonly embedding?: readonly number[];
	readonly embeddingModel?: string;
	/**
	 * Present while a newer revision of this source is staged but not yet embedded.
	 * Superseded chunks are excluded from lexical search (their text is out of date)
	 * but still answer semantic search until their replacements carry vectors.
	 */
	readonly supersededAt?: DateTime;
}

export interface SearchMatch {
	readonly document: SearchDocument;
	readonly score: number;
}

export type KnowledgeSearchSource =
	| { readonly kind: 'unavailable'; readonly projectId: ProjectId }
	| {
			readonly kind: 'note';
			readonly id: NoteId;
			readonly projectId: ProjectId;
			readonly title?: string;
	  }
	| {
			readonly kind: 'diagram';
			readonly id: DiagramId;
			readonly projectId: ProjectId;
			readonly title?: string;
	  }
	| {
			readonly kind: 'widget';
			readonly id: WidgetId;
			readonly projectId: ProjectId;
			readonly title?: string;
	  }
	| {
			readonly kind: 'attachment';
			readonly id: AttachmentId;
			readonly projectId: ProjectId;
			readonly title?: string;
	  }
	| {
			readonly kind: 'memory';
			readonly id: MemoryEntryId;
			readonly projectId: ProjectId;
			readonly title: string;
	  };

export type IndexSource =
	| { readonly kind: 'note'; readonly noteId: NoteId }
	| { readonly kind: 'diagram'; readonly diagramId: DiagramId }
	| { readonly kind: 'widget'; readonly widgetId: WidgetId }
	| { readonly kind: 'memory'; readonly memoryEntryId: MemoryEntryId }
	| { readonly kind: 'attachment'; readonly attachmentId: AttachmentId };
export interface IndexContent {
	readonly source: IndexSource;
	readonly contents: readonly string[];
	readonly embedPrefix: string;
	readonly base: Omit<
		SearchDocument,
		| 'id'
		| 'content'
		| 'contentHash'
		| 'chunkIndex'
		| 'embedding'
		| 'embeddingModel'
		| 'supersededAt'
	>;
}
export type IndexPlan =
	| { readonly kind: 'remove'; readonly source: IndexSource }
	| ({ readonly kind: 'index' } & IndexContent);
export type IndexingResult =
	| { readonly kind: 'stored' }
	| {
			readonly kind: 'needs_embeddings';
			readonly source: IndexSource;
			readonly documents: readonly SearchDocument[];
			readonly missing: readonly { readonly id: SearchDocumentId; readonly input: string }[];
			readonly model: string;
	  };

export type DiagramIndexContext =
	{ readonly kind: 'standalone' } | { readonly kind: 'note'; readonly title: string };

/** Context that the indexing owner must resolve before preparing diagram chunks. */
export type DiagramIndexContextRequirement =
	{ readonly kind: 'source_note'; readonly noteId: NoteId } | { readonly kind: 'standalone' };

/** The reranker that orders knowledge search candidates (ADR 0036). */
export const DEFAULT_RERANK_MODEL = 'cohere/rerank-4-fast';
/** Candidate presentation: title and section as YAML fields, content as a block. */
export const RERANKING_STRATEGY = 'structured-yaml-v1';

/** The part of a chat completion a search-query rewrite reads. */
export const searchQueryCompletionSchema = z.object({
	choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) }))
});

export const rerankResponseSchema = z.object({
	results: z.array(
		z.object({
			index: z.number().int().nonnegative(),
			relevance_score: z.number().optional(),
			relevanceScore: z.number().optional()
		})
	)
});

export interface IndexChunking {
	readonly targetTokens: number;
	readonly overlapTokens: number;
}
