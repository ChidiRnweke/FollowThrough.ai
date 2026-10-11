import type {
	InlineCompletionContext,
	InlineCompletionPassage,
	InlineSuggestionRequest
} from '$lib/models/agent';
import type { MemoryEntry } from '$lib/models/memory';
import type { Note } from '$lib/models/notes';
import type { SearchDocumentId, SearchMatch } from '$lib/models/knowledge-search';
import type { TokenCounter } from '$lib/models/tokenization';

const USER_MEMORY_THRESHOLD = 20;
const USER_MEMORY_LIMIT = 8;
const USER_MEMORY_OUTPUT_TOKENS = 4_000;
const USER_MEMORY_RERANK_TOKENS = 24_000;
const PROJECT_PASSAGE_LIMIT = 8;
const PROJECT_CANDIDATE_LIMIT = 40;

const sourceType = (match: SearchMatch): InlineCompletionPassage['sourceType'] => {
	if (match.document.memoryEntryId) return 'project-memory';
	if (match.document.diagramId) return 'diagram';
	if (match.document.widgetId) return 'widget';
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

const withinTokenBudget = (
	values: readonly string[],
	budget: number,
	tokens: TokenCounter
): readonly string[] => {
	const kept: string[] = [];
	let used = 0;
	for (const value of values) {
		const count = tokens.count(value);
		if (used + count > budget) continue;
		kept.push(value);
		used += count;
	}
	return kept;
};

const memoryAsMatch = (entry: MemoryEntry, note: Note): SearchMatch => ({
	document: {
		id: entry.id as string as SearchDocumentId,
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

export interface IInlineContextService {
	readonly limits: {
		readonly userMemory: number;
		readonly projectPassages: number;
		readonly projectCandidates: number;
	};
	retrievalQuery(request: InlineSuggestionRequest): string;
	inlineContextTraceOutput(context: InlineCompletionContext): string;
	vectorSearchTraceOutput(results: readonly SearchMatch[]): string;
	inlineMemoryPlan(
		entries: readonly MemoryEntry[],
		note: Note
	):
		| { kind: 'complete'; contents: readonly string[] }
		| { kind: 'rank'; candidates: readonly SearchMatch[] };
	inlineRankedMemory(matches: readonly SearchMatch[]): readonly string[];
	inlineProjectCandidates(matches: readonly SearchMatch[], note: Note): readonly SearchMatch[];
	inlineProjectPassages(matches: readonly SearchMatch[]): readonly InlineCompletionPassage[];
	eligibleInlinePrefix(prefix: string): boolean;
	eligibleInlineNote(note: Note): boolean;
}
export class InlineContextService implements IInlineContextService {
	readonly limits: IInlineContextService['limits'] = {
		userMemory: USER_MEMORY_LIMIT,
		projectPassages: PROJECT_PASSAGE_LIMIT,
		projectCandidates: PROJECT_CANDIDATE_LIMIT
	};
	constructor(private readonly tokens: TokenCounter) {}
	retrievalQuery(request: InlineSuggestionRequest): string {
		return [
			request.headingPath.join(' > '),
			request.currentSection.trim(),
			request.prefix.slice(-2_000),
			request.suffix.slice(0, 500)
		]
			.filter(Boolean)
			.join('\n');
	}
	/** Record the actual grounding content in Phoenix, not only counts. */
	inlineContextTraceOutput(context: InlineCompletionContext): string {
		return JSON.stringify({
			noteTitle: context.noteTitle,
			userMemory: context.userMemory,
			projectPassages: context.projectPassages
		});
	}
	vectorSearchTraceOutput(results: readonly SearchMatch[]): string {
		return JSON.stringify(
			results.map((match) => ({
				id: match.document.id,
				sourceTitle: match.document.sourceTitle,
				noteId: match.document.noteId,
				sectionPath: match.document.sectionPath,
				score: match.score,
				content: match.document.content
			}))
		);
	}
	inlineMemoryPlan(
		entries: readonly MemoryEntry[],
		note: Note
	):
		| { kind: 'complete'; contents: readonly string[] }
		| { kind: 'rank'; candidates: readonly SearchMatch[] } {
		const shared = activeSharedUserMemory(entries);
		const contents = shared.map((entry) => entry.content);
		const tokens = contents.reduce((total, content) => total + this.tokens.count(content), 0);
		if (shared.length <= USER_MEMORY_THRESHOLD && tokens <= USER_MEMORY_OUTPUT_TOKENS)
			return { kind: 'complete', contents };
		const candidates: SearchMatch[] = [];
		let used = 0;
		for (const entry of shared) {
			const tokens = this.tokens.count(entry.content);
			if (used + tokens > USER_MEMORY_RERANK_TOKENS) continue;
			candidates.push(memoryAsMatch(entry, note));
			used += tokens;
		}
		return { kind: 'rank', candidates };
	}
	inlineRankedMemory(matches: readonly SearchMatch[]): readonly string[] {
		return withinTokenBudget(
			matches.slice(0, USER_MEMORY_LIMIT).map((match) => match.document.content),
			USER_MEMORY_OUTPUT_TOKENS,
			this.tokens
		);
	}
	inlineProjectCandidates(matches: readonly SearchMatch[], note: Note): readonly SearchMatch[] {
		return matches.filter((match) => match.document.noteId !== note.id);
	}
	inlineProjectPassages(matches: readonly SearchMatch[]): readonly InlineCompletionPassage[] {
		return matches.slice(0, PROJECT_PASSAGE_LIMIT).map(passageOf);
	}
	eligibleInlinePrefix(prefix: string): boolean {
		return prefix.trim().length >= 12;
	}
	eligibleInlineNote(note: Note): boolean {
		return !note.archivedAt;
	}
}
