import type {
	InlineCompletionContext,
	InlineCompletionPassage,
	InlineSuggestionRequest
} from '$lib/models/agent';
import type { MemoryEntry } from '$lib/models/memory';
import type { Note } from '$lib/models/notes';
import type { SearchDocumentId, SearchMatch } from '$lib/models/knowledge-search';
import { getEncoding, type Tiktoken } from 'js-tiktoken';
let encoding: Tiktoken | undefined;
const countRetrievalTokens = (value: string): number =>
	(encoding ??= getEncoding('cl100k_base')).encode(value).length;

const USER_MEMORY_THRESHOLD = 20;
export const USER_MEMORY_LIMIT = 8;
const USER_MEMORY_OUTPUT_TOKENS = 4_000;
const USER_MEMORY_RERANK_TOKENS = 24_000;
export const PROJECT_PASSAGE_LIMIT = 8;
export const PROJECT_CANDIDATE_LIMIT = 40;

export const retrievalQuery = (request: InlineSuggestionRequest): string =>
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

/** Select shared memory facts before the controller decides whether ranking is needed. */
export function inlineMemoryPlan(
	entries: readonly MemoryEntry[],
	note: Note
):
	| { kind: 'complete'; contents: readonly string[] }
	| { kind: 'rank'; candidates: readonly SearchMatch[] } {
	const shared = activeSharedUserMemory(entries);
	const contents = shared.map((entry) => entry.content);
	const tokens = contents.reduce((total, content) => total + countRetrievalTokens(content), 0);
	if (shared.length <= USER_MEMORY_THRESHOLD && tokens <= USER_MEMORY_OUTPUT_TOKENS)
		return { kind: 'complete', contents };
	const candidates: SearchMatch[] = [];
	let used = 0;
	for (const entry of shared) {
		const tokens = countRetrievalTokens(entry.content);
		if (used + tokens > USER_MEMORY_RERANK_TOKENS) continue;
		candidates.push(memoryAsMatch(entry, note));
		used += tokens;
	}
	return { kind: 'rank', candidates };
}

export const inlineRankedMemory = (matches: readonly SearchMatch[]): readonly string[] =>
	withinTokenBudget(
		matches.slice(0, USER_MEMORY_LIMIT).map((match) => match.document.content),
		USER_MEMORY_OUTPUT_TOKENS
	);

export const inlineProjectCandidates = (
	matches: readonly SearchMatch[],
	note: Note
): readonly SearchMatch[] => matches.filter((match) => match.document.noteId !== note.id);

export const inlineProjectPassages = (
	matches: readonly SearchMatch[]
): readonly InlineCompletionPassage[] => matches.slice(0, PROJECT_PASSAGE_LIMIT).map(passageOf);
