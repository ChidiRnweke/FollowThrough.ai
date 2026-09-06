import { z } from 'zod';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

type DiagramId = Brand<string, 'DiagramId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

export type SearchDocumentId = Brand<string, 'SearchDocumentId'>;

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

/** Preserve the chunk's source instead of presenting every search hit as a note. */
export function knowledgeSearchSource(document: SearchDocument): KnowledgeSearchSource {
	const context = {
		projectId: document.projectId,
		...(document.sourceTitle ? { title: document.sourceTitle } : {})
	};
	if (document.attachmentId) return { ...context, kind: 'attachment', id: document.attachmentId };
	if (document.diagramId) return { ...context, kind: 'diagram', id: document.diagramId };
	if (document.memoryEntryId)
		return { ...context, kind: 'memory', id: document.memoryEntryId, title: document.content };
	if (document.noteId) return { ...context, kind: 'note', id: document.noteId };
	return { kind: 'unavailable', projectId: document.projectId };
}
