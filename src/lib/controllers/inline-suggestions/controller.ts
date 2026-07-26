import {
	ExternalServiceError,
	type ActorContext,
	type InlineSuggestion,
	type InlineSuggestionRequest,
	type Note
} from '$lib/models';
import type {
	AgentPreferencesStore,
	InlineCompletionContextBuilder,
	InlineCompletionGenerator,
	InlineSuggestionThrottle
} from '$lib/services';
import type { NoteReader } from '$lib/services/notes/contracts';
import { traceWorkflow } from '$lib/server/domain/telemetry';

const MIN_PREFIX_LENGTH = 12;
const INELIGIBLE: InlineSuggestion = { outcome: 'no_suggestion', reason: 'ineligible' };

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

export class DefaultInlineSuggestionsController implements InlineSuggestionsController {
	constructor(private readonly dependencies: InlineSuggestionsDependencies) {}

	async suggest(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		signal: AbortSignal
	): Promise<InlineSuggestion> {
		if (request.prefix.trim().length < MIN_PREFIX_LENGTH) return INELIGIBLE;
		const note = await this.authorize(actor, request);
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
							signal
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
		request: InlineSuggestionRequest
	): Promise<Note | undefined> {
		if (!(await this.dependencies.preferences.get(actor)).inlineSuggestionsEnabled)
			return undefined;
		const note = await this.dependencies.noteReader.get(actor, request.noteId);
		return note.archivedAt ? undefined : note;
	}
}
