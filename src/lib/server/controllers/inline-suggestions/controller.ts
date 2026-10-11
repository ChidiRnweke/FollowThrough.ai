import { normalizeLanguageModelId } from '$lib/models/agent';
import { type ActorContext } from '$lib/models/identity';
import {
	type InlineSuggestion,
	type InlineSuggestionRequest,
	type InlineCompletionContext
} from '$lib/models/agent';
import { type Note } from '$lib/models/notes';
import type { AgentPreferencesStore } from '$lib/server/services/agent/runs/preferences';
import type { InlineCompletionService } from '$lib/server/services/inline-suggestions/completion';
import type { NoteReader } from '$lib/server/services/notes/catalog';

import type { OperationObserver, WorkflowObserver } from '$lib/models/telemetry';
import type { MemoryEntryLister } from '$lib/server/services/memory/library';
import type { KnowledgeSearch } from '$lib/server/services/knowledge-search/retrieval';
import type { IInlineContextService } from '$lib/server/services/inline-suggestions/inline-context';
import type { InlineAdmission } from '$lib/server/services/inline-suggestions/inline-admission';
import { MimeType, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';

const INELIGIBLE: InlineSuggestion = { outcome: 'no_suggestion', reason: 'ineligible' };

/**
 * Application boundary for inline (ghost-text) completions in the editor.
 *
 * Fires on every typing pause, so it is aggressively gated: it short-circuits on short
 * prefixes, disabled preferences, archived notes, and rate limits before any model call
 * happens, because a completion is a nicety that must never cost a keystroke.
 */
export interface InlineSuggestionsController {
	suggest(request: InlineSuggestionRequest, signal: AbortSignal): Promise<InlineSuggestion>;
}

export interface InlineSuggestionsDependencies {
	context: IInlineContextService;
	completion: InlineCompletionService;
	defaultCompletionModel: string;
	knowledge: KnowledgeSearch;
	memory: MemoryEntryLister;
	observer: OperationObserver;
	workflow: WorkflowObserver;
	admission: InlineAdmission;
	now: () => number;
	noteReader: NoteReader;
	preferences: AgentPreferencesStore;
}

export class InlineSuggestions implements InlineSuggestionsController {
	constructor(
		private readonly actor: ActorContext,
		private readonly dependencies: InlineSuggestionsDependencies
	) {}

	async suggest(request: InlineSuggestionRequest, signal: AbortSignal): Promise<InlineSuggestion> {
		if (!this.dependencies.context.eligibleInlinePrefix(request.prefix)) return INELIGIBLE;
		// One read serves both the on/off gate and the model choice; ghost text
		// fires on every typing pause, so a second round trip here is not free.
		const preferences = await this.dependencies.preferences.get();
		const note = await this.authorize(request, preferences.inlineSuggestionsEnabled);
		if (!note) return INELIGIBLE;
		const authoritativeRequest = { ...request, projectId: note.projectId };
		return this.dependencies.workflow.run(
			'inline.suggestion',
			{
				input: JSON.stringify({
					prefix: request.prefix,
					suffix: request.suffix,
					currentSection: request.currentSection,
					headingPath: request.headingPath,
					blockType: request.blockType
				}),
				userId: this.actor.userId,
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
				const context = await this.buildContext(authoritativeRequest, note, signal);
				const budget = await this.dependencies.admission.consume(
					this.actor.userId,
					this.dependencies.now()
				);
				if (!budget.allowed) return { outcome: budget.reason, retryAfterMs: budget.retryAfterMs };
				const text = await this.dependencies.completion.complete(
					authoritativeRequest,
					context,
					preferences.inlineModel === undefined
						? this.dependencies.defaultCompletionModel
						: normalizeLanguageModelId(preferences.inlineModel),
					signal
				);
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
			},
			(result) => JSON.stringify(result)
		);
	}

	private async buildContext(
		request: InlineSuggestionRequest,
		note: Note,
		signal: AbortSignal
	): Promise<InlineCompletionContext> {
		const query = this.dependencies.context.retrievalQuery(request);
		const { observer, memory, knowledge } = this.dependencies;
		return observer.run(
			'inline.context',
			{ input: query, outputMimeType: MimeType.JSON },
			async () => {
				signal.throwIfAborted();
				const [matches, entries] = await Promise.all([
					observer.run(
						'retrieval.vector-search',
						{ input: query, outputMimeType: MimeType.JSON, kind: OpenInferenceSpanKind.RETRIEVER },
						() =>
							knowledge.candidates(query, {
								limit: this.dependencies.context.limits.projectCandidates,
								projectId: note.projectId,
								signal
							}),
						(matches) => this.dependencies.context.vectorSearchTraceOutput(matches)
					),
					memory.list({})
				]);
				signal.throwIfAborted();
				const candidates = this.dependencies.context.inlineProjectCandidates(matches, note);
				const memoryPlan = this.dependencies.context.inlineMemoryPlan(entries, note);
				const [projectMatches, userMemory] = await Promise.all([
					candidates.length > 1
						? knowledge.rank(
								query,
								candidates,
								this.dependencies.context.limits.projectPassages,
								signal
							)
						: candidates,
					memoryPlan.kind === 'complete'
						? memoryPlan.contents
						: knowledge
								.rank(
									query,
									memoryPlan.candidates,
									this.dependencies.context.limits.userMemory,
									signal
								)
								.then((matches) => this.dependencies.context.inlineRankedMemory(matches))
				]);
				signal.throwIfAborted();
				return {
					noteTitle: note.title,
					noteText: note.plainText,
					userMemory,
					projectPassages: this.dependencies.context.inlineProjectPassages(projectMatches)
				};
			},
			(context) => this.dependencies.context.inlineContextTraceOutput(context)
		);
	}

	private async authorize(
		request: InlineSuggestionRequest,
		enabled: boolean
	): Promise<Note | undefined> {
		if (!enabled) return undefined;
		const note = await this.dependencies.noteReader.get(request.noteId);
		return this.dependencies.context.eligibleInlineNote(note) ? note : undefined;
	}
}
