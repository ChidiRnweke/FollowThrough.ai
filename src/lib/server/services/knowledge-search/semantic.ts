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

/** A vector lookup over saved knowledge. The calling controller creates and ranks the query. */
export class KnowledgeLookup {
	constructor(private readonly repository: RetrievalIndexRepository) {}

	search(
		actor: ActorContext,
		embedding: readonly number[],
		limit: number,
		projectId?: ProjectId,
		filter?: SearchFilter
	): Promise<readonly SearchMatch[]> {
		return this.repository.searchByEmbedding(actor, embedding, limit, projectId, filter);
	}
}

/** A query has exactly one vector; malformed provider output cannot become an empty search. */
export function queryVector(batch: EmbeddingBatch): readonly number[] {
	const vector = batch.vectors[0];
	if (!vector || batch.vectors.length !== 1)
		throw new InvalidGeneratedContentError('Query embedding returned an invalid result');
	return vector;
}

/** Preserve the candidate pool used by the accepted reranking pipeline (ADR 0036). */
export const searchCandidateLimit = (limit: number): number => Math.max(40, limit * 5);

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
