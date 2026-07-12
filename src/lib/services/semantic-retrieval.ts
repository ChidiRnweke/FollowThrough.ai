import type { ActorContext, LinkCandidate, ProjectId, SearchMatch, TextSelection } from '../models';
import { InvalidGeneratedContentError } from '../models';
import type { RetrievalIndexRepository } from '../repositories';
import type {
	EmbeddingClient,
	KnowledgeSearcher,
	LinkFinder,
	RelationshipClassifier
} from './knowledge';
import type { NoteReader } from './notes';

export class EmbeddedKnowledgeSearcher implements KnowledgeSearcher {
	constructor(
		private readonly repository: RetrievalIndexRepository,
		private readonly embeddingClient: EmbeddingClient
	) {}

	async search(
		actor: ActorContext,
		query: string,
		limit = 10,
		projectId?: ProjectId
	): Promise<readonly SearchMatch[]> {
		if (!query.trim()) return [];
		const batch = await this.embeddingClient.embed([query]);
		const embedding = batch.vectors[0];
		if (!embedding || batch.vectors.length !== 1)
			throw new InvalidGeneratedContentError('Query embedding returned an invalid result');
		return this.repository.searchByEmbedding(actor, embedding, limit, projectId);
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
		const unique = new Map(
			matches
				.filter((match) => match.document.noteId !== selection.noteId)
				.map((match) => [match.document.noteId, match])
		);
		return Promise.all(
			[...unique.values()].slice(0, 5).map(async (match) => {
				const classification = await this.classifier.classify(
					selection.text,
					match.document.content
				);
				return {
					targetNoteId: match.document.noteId,
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
