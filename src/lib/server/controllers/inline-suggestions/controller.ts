import { type ActorContext } from '$lib/models/identity';
import {
	type InlineSuggestion,
	type InlineSuggestionRequest,
	type InlineCompletionContext
} from '$lib/models/agent';
import type { SearchMatch } from '$lib/models/knowledge-search';
import { type Note } from '$lib/models/notes';
import { ExternalServiceError } from '$lib/errors';
import type { AgentPreferencesStore } from '$lib/server/services/agent/runs/preferences';
import type {
	InlineCompletionGenerator,
	InlineSuggestionThrottle
} from '$lib/server/services/agent/runs/contracts';
import type { NoteReader } from '$lib/server/services/notes/contracts';
import { traceWorkflow } from '$lib/server/services/telemetry';
import type { OperationObserver } from '$lib/models/telemetry';
import type { MemoryEntryLister } from '$lib/server/services/memory/contracts';
import type { EmbeddingClient, Reranker } from '$lib/server/services/knowledge-search/contracts';
import { queryVector, type KnowledgeLookup } from '$lib/server/services/knowledge-search/semantic';
import {
	retrievalQuery,
	inlineMemoryPlan,
	inlineRankedMemory,
	inlineProjectCandidates,
	inlineProjectPassages,
	inlineContextTraceOutput,
	vectorSearchTraceOutput,
	PROJECT_CANDIDATE_LIMIT,
	PROJECT_PASSAGE_LIMIT,
	USER_MEMORY_LIMIT
} from '$lib/server/services/inline-suggestions/inline-context';
import { MimeType, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';

const MIN_PREFIX_LENGTH = 12;
const INELIGIBLE: InlineSuggestion = { outcome: 'no_suggestion', reason: 'ineligible' };

/**
 * Application boundary for inline (ghost-text) completions in the editor.
 *
 * Fires on every typing pause, so it is aggressively gated: it short-circuits on short
 * prefixes, disabled preferences, archived notes, and rate limits before any model call
 * happens, because a completion is a nicety that must never cost a keystroke.
 */
export interface InlineSuggestionsController {
	suggest(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		signal: AbortSignal
	): Promise<InlineSuggestion>;
}

export interface InlineSuggestionsDependencies {
	inlineCompletionGenerator: InlineCompletionGenerator;
	embeddings: EmbeddingClient;
	knowledgeLookup: Pick<KnowledgeLookup, 'search'>;
	reranker: Reranker;
	memory: MemoryEntryLister;
	observer: OperationObserver;
	inlineSuggestionThrottle: InlineSuggestionThrottle;
	noteReader: NoteReader;
	preferences: AgentPreferencesStore;
}

export class InlineSuggestions implements InlineSuggestionsController {
	constructor(private readonly dependencies: InlineSuggestionsDependencies) {}

	async suggest(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		signal: AbortSignal
	): Promise<InlineSuggestion> {
		if (request.prefix.trim().length < MIN_PREFIX_LENGTH) return INELIGIBLE;
		// One read serves both the on/off gate and the model choice; ghost text
		// fires on every typing pause, so a second round trip here is not free.
		const preferences = await this.dependencies.preferences.get(actor);
		const note = await this.authorize(actor, request, preferences.inlineSuggestionsEnabled);
		if (!note) return INELIGIBLE;
		const admission = this.dependencies.inlineSuggestionThrottle.admit(actor.userId);
		if (!admission.allowed)
			return { outcome: admission.reason, retryAfterMs: admission.retryAfterMs };
		const authoritativeRequest = { ...request, projectId: note.projectId };
		return traceWorkflow(
			'inline.suggestion',
			{
				input: JSON.stringify({
					prefix: request.prefix,
					suffix: request.suffix,
					currentSection: request.currentSection,
					headingPath: request.headingPath,
					blockType: request.blockType
				}),
				userId: actor.userId,
				metadata: {
					requestId: request.requestId,
					noteId: request.noteId,
					projectId: note.projectId,
					revision: request.revision,
					surface: 'note-editor'
				},
				tags: ['inline', 'suggestion']
			},
			async () => {
				try {
					const context = await this.buildContext(actor, authoritativeRequest, note, signal);
					const budget = this.dependencies.inlineSuggestionThrottle.consume(actor.userId);
					if (!budget.allowed) return { outcome: budget.reason, retryAfterMs: budget.retryAfterMs };
					let text: string;
					try {
						text = await this.dependencies.inlineCompletionGenerator.complete(
							authoritativeRequest,
							context,
							signal,
							preferences.inlineModel
						);
					} catch (error) {
						if (signal.aborted) throw error;
						throw new ExternalServiceError('Inline completion provider failed', {
							cause: error instanceof Error ? error.message : String(error)
						});
					}
					if (!text) return { outcome: 'no_suggestion', reason: 'empty_model' };
					return {
						outcome: 'suggested',
						text,
						grounding: {
							currentNote: true,
							userMemoryCount: context.userMemory.length,
							projectPassageCount: context.projectPassages.length
						}
					};
				} finally {
					this.dependencies.inlineSuggestionThrottle.release(actor.userId);
				}
			},
			(result) => JSON.stringify(result)
		);
	}

	private async buildContext(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		note: Note,
		signal: AbortSignal
	): Promise<InlineCompletionContext> {
		const query = retrievalQuery(request);
		const { observer, memory, embeddings, knowledgeLookup } = this.dependencies;
		return observer.run(
			'inline.context',
			{ input: query, outputMimeType: MimeType.JSON },
			async () => {
				signal.throwIfAborted();
				const [matches, entries] = await Promise.all([
					observer.run(
						'retrieval.vector-search',
						{ input: query, outputMimeType: MimeType.JSON, kind: OpenInferenceSpanKind.RETRIEVER },
						async () => {
							const batch = await embeddings.embed([query], signal);
							signal.throwIfAborted();
							return knowledgeLookup.search(
								actor,
								queryVector(batch),
								PROJECT_CANDIDATE_LIMIT,
								note.projectId
							);
						},
						vectorSearchTraceOutput
					),
					memory.list(actor, {})
				]);
				signal.throwIfAborted();
				const candidates = inlineProjectCandidates(matches, note);
				const memoryPlan = inlineMemoryPlan(entries, note);
				const [projectMatches, userMemory] = await Promise.all([
					candidates.length > 1
						? this.rank(query, candidates, PROJECT_PASSAGE_LIMIT, signal)
						: candidates,
					memoryPlan.kind === 'complete'
						? memoryPlan.contents
						: this.rank(query, memoryPlan.candidates, USER_MEMORY_LIMIT, signal).then(
								inlineRankedMemory
							)
				]);
				signal.throwIfAborted();
				return {
					noteTitle: note.title,
					noteText: note.plainText,
					userMemory,
					projectPassages: inlineProjectPassages(projectMatches)
				};
			},
			inlineContextTraceOutput
		);
	}

	private async rank(
		query: string,
		candidates: readonly SearchMatch[],
		limit: number,
		signal: AbortSignal
	): Promise<readonly SearchMatch[]> {
		try {
			return await this.dependencies.reranker.rerank(query, candidates, limit, signal);
		} catch (error) {
			if (signal.aborted) throw error;
			// ADR 0036: the provider trace retains the failure; already retrieved knowledge remains usable.
			return candidates.slice(0, limit);
		}
	}

	private async authorize(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		enabled: boolean
	): Promise<Note | undefined> {
		if (!enabled) return undefined;
		const note = await this.dependencies.noteReader.get(actor, request.noteId);
		return note.archivedAt ? undefined : note;
	}
}
