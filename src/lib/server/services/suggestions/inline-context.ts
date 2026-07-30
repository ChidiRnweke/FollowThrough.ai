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
import { getEncoding } from 'js-tiktoken';
import { MimeType, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';
interface OperationObserver {
	run<T>(
		name: string,
		context: unknown,
		body: () => Promise<T>,
		describeOutput?: (result: T) => string
	): Promise<T>;
}
const directObserver: OperationObserver = { run: (_name, _context, body) => body() };

const tokenEncoding = getEncoding('cl100k_base');
const countRetrievalTokens = (value: string): number => tokenEncoding.encode(value).length;

interface KnowledgeSearcher {
	search(
		actor: ActorContext,
		query: string,
		limit?: number,
		projectId?: import('$lib/models').ProjectId,
		signal?: AbortSignal
	): Promise<readonly SearchMatch[]>;
}

interface MemoryEntryLister {
	list(
		actor: ActorContext,
		filter: Readonly<Record<string, unknown>>
	): Promise<readonly MemoryEntry[]>;
}

interface Reranker {
	rerank(
		query: string,
		matches: readonly SearchMatch[],
		topN: number,
		signal?: AbortSignal
	): Promise<readonly SearchMatch[]>;
}

export interface IInlineSuggestionContext {
	build(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		note: Note,
		signal: AbortSignal
	): Promise<InlineCompletionContext>;
}

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
	readonly observer?: OperationObserver;
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

/**
 * Phoenix must show what the completer actually grounded on, not how many
 * items there were — counts are useless for improving retrieval.
 */
export const inlineContextTraceOutput = (context: InlineCompletionContext): string =>
	JSON.stringify({
		noteTitle: context.noteTitle,
		userMemory: context.userMemory,
		projectPassages: context.projectPassages
	});

export const vectorSearchTraceOutput = (results: readonly SearchMatch[]): string =>
	JSON.stringify(
		results.map((match) => ({
			id: match.document.id,
			sourceTitle: match.document.sourceTitle,
			noteId: match.document.noteId,
			sectionPath: match.document.sectionPath,
			score: match.score,
			content: match.document.content
		}))
	);

export class InlineSuggestionContext implements IInlineSuggestionContext {
	private readonly observer: OperationObserver;
	constructor(private readonly dependencies: RetrievalInlineCompletionContextDependencies) {
		this.observer = dependencies.observer ?? directObserver;
	}

	async build(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		note: Note,
		signal: AbortSignal
	): Promise<InlineCompletionContext> {
		const query = retrievalQuery(request);
		return this.observer.run(
			'inline.context',
			{ input: query, outputMimeType: MimeType.JSON },
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
			inlineContextTraceOutput
		);
	}

	private async projectPassages(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		query: string,
		signal: AbortSignal
	): Promise<readonly InlineCompletionPassage[]> {
		const matches = await this.observer.run(
			'retrieval.vector-search',
			{
				input: query,
				outputMimeType: MimeType.JSON,
				kind: OpenInferenceSpanKind.RETRIEVER
			},
			async () => {
				return this.dependencies.searcher.search(
					actor,
					query,
					PROJECT_CANDIDATE_LIMIT,
					request.projectId,
					signal
				);
			},
			vectorSearchTraceOutput
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
