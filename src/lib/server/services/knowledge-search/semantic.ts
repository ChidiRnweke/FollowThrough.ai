import type { ActorContext } from '$lib/models/identity';
import type { LinkCandidate, RelationshipKind } from '$lib/models/relationships';
import type { Note, NoteId, TextSelection } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { SearchMatch } from '$lib/models/knowledge-search';
import { InvalidGeneratedContentError } from '$lib/errors';
import type { RetrievalIndexRepository } from '$lib/server/repositories/knowledge-search';
import type { SearchFilter } from '$lib/server/repositories/knowledge-search';
interface EmbeddingClient {
	readonly model: string;
	embed(
		contents: readonly string[],
		signal?: AbortSignal
	): Promise<{ readonly model: string; readonly vectors: readonly (readonly number[])[] }>;
}
export interface KnowledgeSearcher {
	search(
		actor: ActorContext,
		query: string,
		limit?: number,
		projectId?: ProjectId,
		signal?: AbortSignal,
		filter?: SearchFilter
	): Promise<readonly SearchMatch[]>;
}
export interface Reranker {
	rerank(
		query: string,
		matches: readonly SearchMatch[],
		topN: number,
		signal?: AbortSignal
	): Promise<readonly SearchMatch[]>;
}

interface LinkFinder {
	find(actor: ActorContext, selection: TextSelection): Promise<readonly LinkCandidate[]>;
}
interface RelationshipClassifier {
	classify(
		sourceText: string,
		targetText: string
	): Promise<{
		readonly kind: RelationshipKind;
		readonly justification: string;
		readonly confidence: number;
	}>;
}
interface NoteReader {
	get(actor: ActorContext, noteId: NoteId): Promise<Note>;
}

export class EmbeddedKnowledgeSearcher implements KnowledgeSearcher {
	constructor(
		private readonly repository: RetrievalIndexRepository,
		private readonly embeddingClient: EmbeddingClient
	) {}

	async search(
		actor: ActorContext,
		query: string,
		limit = 10,
		projectId?: ProjectId,
		signal?: AbortSignal,
		filter?: SearchFilter
	): Promise<readonly SearchMatch[]> {
		if (!query.trim()) return [];
		const batch = await this.embeddingClient.embed([query], signal);
		const embedding = batch.vectors[0];
		if (!embedding || batch.vectors.length !== 1)
			throw new InvalidGeneratedContentError('Query embedding returned an invalid result');
		return this.repository.searchByEmbedding(actor, embedding, limit, projectId, filter);
	}
}

/**
 * Wraps a knowledge searcher with a reranking stage: retrieve a wide candidate
 * set from the cheap vector search, then shrink it to `limit` with the reranker.
 */
export class RerankingKnowledgeSearcher implements KnowledgeSearcher {
	constructor(
		private readonly inner: KnowledgeSearcher,
		private readonly reranker: Reranker,
		private readonly candidateMultiplier = 5,
		private readonly minCandidates = 40
	) {}

	async search(
		actor: ActorContext,
		query: string,
		limit = 10,
		projectId?: ProjectId,
		signal?: AbortSignal,
		filter?: SearchFilter
	): Promise<readonly SearchMatch[]> {
		if (!query.trim()) return [];
		const wideLimit = Math.max(this.minCandidates, limit * this.candidateMultiplier);
		const candidates = await this.inner.search(actor, query, wideLimit, projectId, signal, filter);
		if (candidates.length <= limit) return candidates;
		return this.reranker.rerank(query, candidates, limit, signal);
	}
}

export class ProjectScopedLinkFinder implements LinkFinder {
	constructor(
		private readonly noteReader: NoteReader,
		private readonly searcher: KnowledgeSearcher,
		private readonly classifier: RelationshipClassifier = new HeuristicRelationshipClassifier()
	) {}

	async find(actor: ActorContext, selection: TextSelection): Promise<readonly LinkCandidate[]> {
		const note = await this.noteReader.get(actor, selection.noteId);
		const matches = await this.searcher.search(actor, selection.text, 12, note.projectId);
		const unique = new Map<NoteId, SearchMatch>();
		for (const match of matches) {
			const targetNoteId = match.document.noteId;
			if (targetNoteId !== undefined && targetNoteId !== selection.noteId)
				unique.set(targetNoteId, match);
		}
		return Promise.all(
			[...unique.entries()].slice(0, 5).map(async ([targetNoteId, match]) => {
				const classification = await this.classifier.classify(
					selection.text,
					match.document.content
				);
				return {
					targetNoteId,
					kind: classification.kind,
					justification: classification.justification,
					confidence: Math.round(
						(Math.max(0, Math.min(100, classification.confidence)) +
							Math.max(0, Math.min(1, match.score)) * 100) /
							2
					)
				};
			})
		);
	}
}

export class HeuristicRelationshipClassifier implements RelationshipClassifier {
	async classify(sourceText: string, targetText: string) {
		const sourceNegates = /\b(?:not|never|instead|opposite|avoid)\b/i.test(sourceText);
		const targetNegates = /\b(?:not|never|instead|opposite|avoid)\b/i.test(targetText);
		if (sourceNegates !== targetNegates)
			return {
				kind: 'contradicts' as const,
				justification: 'The two passages express opposing constraints or recommendations.',
				confidence: 70
			};
		if (/\b(?:decided|decision|selected|chose|approved)\b/i.test(targetText))
			return {
				kind: 'prior_decision' as const,
				justification:
					'The related passage records an earlier decision relevant to this selection.',
				confidence: 70
			};
		return {
			kind: 'mentions' as const,
			justification: `Semantically related content: ${targetText.slice(0, 180)}`,
			confidence: 60
		};
	}
}
