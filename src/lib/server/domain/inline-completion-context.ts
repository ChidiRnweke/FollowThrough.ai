import type {
	ActorContext,
	InlineCompletionContext,
	InlineCompletionPassage,
	InlineSuggestionRequest,
	MemoryEntry,
	Note,
	SearchDocumentId,
	SearchMatch
} from '$lib/models';
import type {
	InlineCompletionContextBuilder,
	KnowledgeSearcher,
	MemoryEntryLister,
	Reranker
} from '$lib/services';
import { countRetrievalTokens } from '$lib/services/retrieval/tokenizer';
import { traceChainStep, traceInline } from './telemetry';

const USER_MEMORY_THRESHOLD = 20;
const USER_MEMORY_LIMIT = 8;
const USER_MEMORY_OUTPUT_TOKENS = 4_000;
const USER_MEMORY_RERANK_TOKENS = 24_000;
const PROJECT_PASSAGE_LIMIT = 8;
const PROJECT_CANDIDATE_LIMIT = 40;

export interface RetrievalInlineCompletionContextDependencies {
	readonly searcher: KnowledgeSearcher;
	readonly memory: MemoryEntryLister;
	readonly reranker: Reranker;
}

const retrievalQuery = (request: InlineSuggestionRequest): string =>
	[
		request.headingPath.join(' > '),
		request.currentSection.trim(),
		request.prefix.slice(-2_000),
		request.suffix.slice(0, 500)
	]
		.filter(Boolean)
		.join('\n');

const sourceType = (match: SearchMatch): InlineCompletionPassage['sourceType'] => {
	if (match.document.memoryEntryId) return 'project-memory';
	if (match.document.diagramId) return 'diagram';
	if (match.document.attachmentId || match.document.attachmentPath) return 'attachment';
	return 'note';
};

const passageOf = (match: SearchMatch): InlineCompletionPassage => ({
	sourceTitle: match.document.sourceTitle ?? 'Untitled source',
	sourceType: sourceType(match),
	...(match.document.sectionPath ? { sectionPath: match.document.sectionPath } : {}),
	content: match.document.content
});

const activeSharedUserMemory = (entries: readonly MemoryEntry[]): readonly MemoryEntry[] =>
	entries.filter((entry) => !entry.projectId && !entry.deletedAt && entry.shareWithAgents);

const withinTokenBudget = (values: readonly string[], budget: number): readonly string[] => {
	const kept: string[] = [];
	let used = 0;
	for (const value of values) {
		const tokens = countRetrievalTokens(value);
		if (used + tokens > budget) continue;
		kept.push(value);
		used += tokens;
	}
	return kept;
};

const memoryAsMatch = (entry: MemoryEntry, note: Note): SearchMatch => ({
	document: {
		id: entry.id as unknown as SearchDocumentId,
		projectId: note.projectId,
		memoryEntryId: entry.id,
		sourceTitle: 'User memory',
		content: entry.content,
		contentHash: entry.id,
		sourceRevision: 1,
		chunkIndex: 0
	},
	score: 0
});

export class RetrievalInlineCompletionContextBuilder implements InlineCompletionContextBuilder {
	constructor(private readonly dependencies: RetrievalInlineCompletionContextDependencies) {}

	async build(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		note: Note,
		signal: AbortSignal
	): Promise<InlineCompletionContext> {
		const query = retrievalQuery(request);
		return traceInline(
			'inline.context',
			{ sessionId: request.noteId, model: 'retrieval', input: `query:${query.length}` },
			async () => {
				signal.throwIfAborted();
				const [projectPassages, userEntries] = await Promise.all([
					this.projectPassages(actor, request, query, signal).catch((error) => {
						if (signal.aborted) throw error;
						return [] as readonly InlineCompletionPassage[];
					}),
					this.dependencies.memory.list(actor, {}).catch(() => [] as readonly MemoryEntry[])
				]);
				signal.throwIfAborted();
				const userMemory = await this.userMemory(
					query,
					activeSharedUserMemory(userEntries),
					note,
					signal
				);
				signal.throwIfAborted();
				return {
					noteTitle: note.title,
					noteText: note.plainText,
					userMemory,
					projectPassages
				};
			},
			(context) =>
				`${context.userMemory.length} user memories, ${context.projectPassages.length} project passages`
		);
	}

	private async projectPassages(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		query: string,
		signal: AbortSignal
	): Promise<readonly InlineCompletionPassage[]> {
		return traceChainStep(
			'inline.project-rag',
			`query:${query.length}`,
			async () => {
				const matches = await this.dependencies.searcher.search(
					actor,
					query,
					PROJECT_CANDIDATE_LIMIT,
					request.projectId,
					signal
				);
				const candidates = matches.filter((match) => match.document.noteId !== request.noteId);
				if (candidates.length <= PROJECT_PASSAGE_LIMIT) return candidates.map(passageOf);
				const ranked = await this.dependencies.reranker
					.rerank(query, candidates, PROJECT_PASSAGE_LIMIT, signal)
					.catch((error) => {
						if (signal.aborted) throw error;
						return candidates.slice(0, PROJECT_PASSAGE_LIMIT);
					});
				return ranked.slice(0, PROJECT_PASSAGE_LIMIT).map(passageOf);
			},
			(passages) => `${passages.length} kept`
		);
	}

	private async userMemory(
		query: string,
		entries: readonly MemoryEntry[],
		note: Note,
		signal: AbortSignal
	): Promise<readonly string[]> {
		const contents = entries.map((entry) => entry.content);
		const tokenCount = contents.reduce(
			(total, content) => total + countRetrievalTokens(content),
			0
		);
		if (entries.length <= USER_MEMORY_THRESHOLD && tokenCount <= USER_MEMORY_OUTPUT_TOKENS)
			return contents;

		const candidates: SearchMatch[] = [];
		let used = 0;
		for (const entry of entries) {
			const tokens = countRetrievalTokens(entry.content);
			if (used + tokens > USER_MEMORY_RERANK_TOKENS) continue;
			candidates.push(memoryAsMatch(entry, note));
			used += tokens;
		}
		const ranked = await this.dependencies.reranker
			.rerank(query, candidates, USER_MEMORY_LIMIT, signal)
			.catch((error) => {
				if (signal.aborted) throw error;
				return candidates.slice(0, USER_MEMORY_LIMIT);
			});
		return withinTokenBudget(
			ranked.slice(0, USER_MEMORY_LIMIT).map((match) => match.document.content),
			USER_MEMORY_OUTPUT_TOKENS
		);
	}
}
