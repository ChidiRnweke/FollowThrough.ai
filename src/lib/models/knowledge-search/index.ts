type Brand<T, Name extends string> = T & { readonly __brand: Name };

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

type DiagramId = Brand<string, 'DiagramId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

export type SearchDocumentId = Brand<string, 'SearchDocumentId'>;

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
