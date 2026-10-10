import type { StoredMessage } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type {
	SearchMatch,
	SearchDocument,
	KnowledgeSearchSource
} from '$lib/models/knowledge-search';
import { InvalidGeneratedContentError } from '$lib/errors';
import type {
	RetrievalIndexRepository,
	SearchFilter
} from '$lib/server/repositories/knowledge-search';
import type { EmbeddingBatch } from '$lib/models/knowledge-search/embeddings';

export interface IKnowledgeLookup {
	queryInput(
		query: string,
		history: readonly StoredMessage[]
	): { kind: 'direct'; query: string } | { kind: 'conversation'; transcript: string };
	search(
		actor: ActorContext,
		batch: EmbeddingBatch,
		limit: number,
		projectId?: ProjectId,
		filter?: SearchFilter
	): Promise<readonly SearchMatch[]>;
	candidateLimit(limit: number): number;
	source(document: SearchDocument): KnowledgeSearchSource;
}

/** A vector lookup over saved knowledge. The controller creates and ranks the query. */
export class KnowledgeLookup implements IKnowledgeLookup {
	constructor(private readonly repository: RetrievalIndexRepository) {}
	queryInput(
		query: string,
		history: readonly StoredMessage[]
	): { kind: 'direct'; query: string } | { kind: 'conversation'; transcript: string } {
		return searchQueryInput(query, history);
	}
	search(
		actor: ActorContext,
		batch: EmbeddingBatch,
		limit: number,
		projectId?: ProjectId,
		filter?: SearchFilter
	): Promise<readonly SearchMatch[]> {
		return this.repository.searchByEmbedding(actor, queryVector(batch), limit, projectId, filter);
	}
	/** Preserve the accepted candidate pool (ADR 0036). */
	candidateLimit(limit: number): number {
		return Math.max(40, limit * 5);
	}
	source(document: SearchDocument): KnowledgeSearchSource {
		return knowledgeSearchSource(document);
	}
}

/** A query has exactly one vector; malformed provider output cannot become an empty search. */
function queryVector(batch: EmbeddingBatch): readonly number[] {
	const vector = batch.vectors[0];
	if (!vector || batch.vectors.length !== 1)
		throw new InvalidGeneratedContentError('Query embedding returned an invalid result');
	return vector;
}

/** Preserve the chunk's source instead of presenting every search hit as a note. */
function knowledgeSearchSource(document: SearchDocument): KnowledgeSearchSource {
	const context = {
		projectId: document.projectId,
		...(document.sourceTitle ? { title: document.sourceTitle } : {})
	};
	if (document.attachmentId) return { ...context, kind: 'attachment', id: document.attachmentId };
	if (document.diagramId) return { ...context, kind: 'diagram', id: document.diagramId };
	if (document.widgetId) return { ...context, kind: 'widget', id: document.widgetId };
	if (document.memoryEntryId)
		return { ...context, kind: 'memory', id: document.memoryEntryId, title: document.content };
	if (document.noteId) return { ...context, kind: 'note', id: document.noteId };
	return { kind: 'unavailable', projectId: document.projectId };
}

/** Resolve whether search needs a conversation rewrite and preserve only readable speech. */
function searchQueryInput(
	query: string,
	history: readonly StoredMessage[]
): { kind: 'direct'; query: string } | { kind: 'conversation'; transcript: string } {
	if (history.length <= 1) return { kind: 'direct', query };
	const spoken = history.flatMap((message) => {
		if (message.kind === 'unreadable') return [];
		const content = message.content;
		return [
			typeof content.text === 'string'
				? content.text
				: typeof content.content === 'string'
					? content.content
					: JSON.stringify(content)
		];
	});
	return { kind: 'conversation', transcript: [...spoken, 'user: ' + query].join('\n') };
}
