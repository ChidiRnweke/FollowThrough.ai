import type { ActorContext, InlineSuggestion, InlineSuggestionRequest } from '$lib/models';
import type {
	InlineBriefCache,
	InlineBriefKeyBuilder,
	InlineCompletionGenerator,
	InlineContextBriefer,
	InlineSuggestionThrottle
} from '$lib/services';

/**
 * Orchestrates the two tiers of proactive ghost text.
 *
 * The completion always runs immediately against whatever grounding is already
 * warm; the tool-calling briefing pass is fired and forgotten so a cache miss
 * costs the writer nothing but a less-grounded first suggestion. Nothing here
 * touches the database: an unaccepted suggestion is not an event, and an
 * accepted one becomes an ordinary note edit.
 */

/** Below this, there is not enough of a sentence to continue meaningfully. */
const MIN_PREFIX_LENGTH = 40;

const NOTHING: InlineSuggestion = { text: '', grounded: false };

export interface InlineSuggestionsController {
	suggest(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		signal: AbortSignal
	): Promise<InlineSuggestion>;
}

export interface InlineSuggestionsDependencies {
	inlineCompletionGenerator: InlineCompletionGenerator;
	inlineContextBriefer: InlineContextBriefer;
	inlineBriefCache: InlineBriefCache;
	inlineBriefKey: InlineBriefKeyBuilder;
	inlineSuggestionThrottle: InlineSuggestionThrottle;
}

export class DefaultInlineSuggestionsController implements InlineSuggestionsController {
	constructor(private readonly dependencies: InlineSuggestionsDependencies) {}

	async suggest(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		signal: AbortSignal
	): Promise<InlineSuggestion> {
		if (request.prefix.trim().length < MIN_PREFIX_LENGTH) return NOTHING;
		if (!this.dependencies.inlineSuggestionThrottle.admit(actor.userId)) return NOTHING;
		try {
			const key = this.dependencies.inlineBriefKey({
				userId: actor.userId,
				noteId: request.noteId,
				revision: request.revision,
				...(request.heading ? { heading: request.heading } : {})
			});
			const brief = this.dependencies.inlineBriefCache.get(key);
			if (!brief) this.warm(actor, request, key);
			const text = await this.dependencies.inlineCompletionGenerator.complete(
				request,
				brief,
				signal
			);
			return { text, grounded: brief !== undefined };
		} finally {
			this.dependencies.inlineSuggestionThrottle.release(actor.userId);
		}
	}

	/**
	 * Detached on purpose: the briefing pass outlives this request, so it gets its
	 * own signal and its failures never reach the writer.
	 */
	private warm(actor: ActorContext, request: InlineSuggestionRequest, key: string): void {
		void this.dependencies.inlineContextBriefer
			.brief(actor, request, new AbortController().signal)
			.then((brief) => this.dependencies.inlineBriefCache.set(key, brief))
			.catch(() => undefined);
	}
}
