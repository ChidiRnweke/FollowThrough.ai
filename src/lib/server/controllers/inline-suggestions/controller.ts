import { type ActorContext } from '$lib/models/identity';
import { type InlineSuggestion, type InlineSuggestionRequest } from '$lib/models/agent';
import { type Note } from '$lib/models/notes';
import { ExternalServiceError } from '$lib/errors';
import type { AgentPreferencesStore } from '$lib/server/services/agent/runs/preferences';
import type {
	InlineCompletionContextBuilder,
	InlineCompletionGenerator,
	InlineSuggestionThrottle
} from '$lib/server/services/agent/runs/contracts';
import type { NoteReader } from '$lib/server/services/notes/catalog';
import { traceWorkflow } from '$lib/server/services/telemetry';

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
	inlineCompletionContextBuilder: InlineCompletionContextBuilder;
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
					const context = await this.dependencies.inlineCompletionContextBuilder.build(
						actor,
						authoritativeRequest,
						note,
						signal
					);
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
