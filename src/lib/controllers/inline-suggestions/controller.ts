import type {
	ActorContext,
	InlineContextBrief,
	InlineSuggestion,
	InlineSuggestionRequest
} from '$lib/models';
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

/**
 * How long a suggestion will wait for a cold brief before giving up and
 * generating ungrounded. Long enough for the first suggestion in a section to
 * land grounded when retrieval is quick; short enough not to stall the caret.
 */
const INLINE_BRIEF_WAIT_MS = 800;

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
	/** Head start given to a cold brief before generating ungrounded. Test seam. */
	inlineBriefWaitMs?: number;
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
				...(request.heading ? { heading: request.heading } : {})
			});
			const brief =
				this.dependencies.inlineBriefCache.get(key) ?? (await this.warmAndRace(actor, request, key));
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
	 * Start the briefing pass and give it a bounded head start. The brief runs on
	 * its own detached signal so the timeout never cancels it: on a slow miss we
	 * generate ungrounded now, and the brief still resolves and caches for the
	 * next suggestion in this section. Its failures never reach the writer.
	 */
	private warmAndRace(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		key: string
	): Promise<InlineContextBrief | undefined> {
		const pending = this.dependencies.inlineContextBriefer
			.brief(actor, request, new AbortController().signal)
			.then((brief) => {
				this.dependencies.inlineBriefCache.set(key, brief);
				return brief;
			})
			.catch(() => undefined);
		const waitMs = this.dependencies.inlineBriefWaitMs ?? INLINE_BRIEF_WAIT_MS;
		return Promise.race([
			pending,
			new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), waitMs))
		]);
	}
}
