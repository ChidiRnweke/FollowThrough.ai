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
import type { AgentPreferencesStore } from '$lib/services';
import type { NoteReader } from '$lib/services/notes/contracts';

/**
 * Orchestrates the two tiers of proactive ghost text.
 *
 * The completion runs only when a concrete, project-grounded brief is ready.
 * The briefing pass can outlive an abandoned caret request, so a slow cache
 * miss warms the next pause without ever showing speculative text. An accepted
 * suggestion becomes an ordinary note edit; an unaccepted one is not persisted.
 */

/** Below this, there is not enough of a sentence to continue meaningfully. */
const MIN_PREFIX_LENGTH = 40;

/**
 * How long a suggestion waits for a cold grounded brief before staying silent.
 * Long enough for the first suggestion in a section to land when retrieval is
 * quick; bounded so an abandoned request never sits on the typing path.
 */
const INLINE_BRIEF_WAIT_MS = 2_500;

const NOTHING: InlineSuggestion = { text: '', grounded: false };

export interface InlineSuggestionsController {
	suggest(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		signal: AbortSignal
	): Promise<InlineSuggestion>;
	warm(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		signal: AbortSignal
	): Promise<boolean>;
}

export interface InlineSuggestionsDependencies {
	inlineCompletionGenerator: InlineCompletionGenerator;
	inlineContextBriefer: InlineContextBriefer;
	inlineBriefCache: InlineBriefCache;
	inlineBriefKey: InlineBriefKeyBuilder;
	inlineSuggestionThrottle: InlineSuggestionThrottle;
	noteReader: NoteReader;
	preferences: AgentPreferencesStore;
	/** Maximum time a completion waits for a cold grounded brief. Test seam. */
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
		const authoritativeRequest = await this.authorize(actor, request);
		if (!authoritativeRequest) return NOTHING;
		const key = this.key(actor, authoritativeRequest);
		const brief =
			this.dependencies.inlineBriefCache.get(key) ??
			(await this.waitForBrief(this.load(actor, authoritativeRequest, key), signal));
		if (!brief || !isGrounded(brief)) return NOTHING;
		if (!this.dependencies.inlineSuggestionThrottle.admit(actor.userId)) return NOTHING;
		try {
			const text = await this.dependencies.inlineCompletionGenerator.complete(
				authoritativeRequest,
				brief,
				signal
			);
			return { text, grounded: true };
		} finally {
			this.dependencies.inlineSuggestionThrottle.release(actor.userId);
		}
	}

	async warm(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		signal: AbortSignal
	): Promise<boolean> {
		if (request.prefix.trim().length < MIN_PREFIX_LENGTH) return false;
		const authoritativeRequest = await this.authorize(actor, request);
		if (!authoritativeRequest) return false;
		const key = this.key(actor, authoritativeRequest);
		const brief =
			this.dependencies.inlineBriefCache.get(key) ??
			(await this.waitForBrief(this.load(actor, authoritativeRequest, key), signal));
		return Boolean(brief && isGrounded(brief));
	}

	/**
	 * Start the briefing pass on a detached signal. A caret move can abandon the
	 * waiting request without wasting retrieval already underway; a later pause
	 * in the same section can reuse the in-flight or cached brief.
	 */
	private load(
		actor: ActorContext,
		request: InlineSuggestionRequest,
		key: string
	): Promise<InlineContextBrief> {
		return this.dependencies.inlineBriefCache.getOrLoad(key, () =>
			this.dependencies.inlineContextBriefer
				.brief(actor, request, new AbortController().signal)
				.then((brief) => {
					if (isGrounded(brief)) this.dependencies.inlineBriefCache.set(key, brief);
					return brief;
				})
		);
	}

	private async waitForBrief(
		pending: Promise<InlineContextBrief>,
		signal: AbortSignal
	): Promise<InlineContextBrief | undefined> {
		const waitMs = this.dependencies.inlineBriefWaitMs ?? INLINE_BRIEF_WAIT_MS;
		const deadline = AbortSignal.timeout(waitMs);
		const combined = AbortSignal.any([signal, deadline]);
		if (combined.aborted) return undefined;
		return new Promise((resolve) => {
			const stop = () => resolve(undefined);
			combined.addEventListener('abort', stop, { once: true });
			void pending
				.then(resolve, () => resolve(undefined))
				.finally(() => combined.removeEventListener('abort', stop));
		});
	}

	private async authorize(
		actor: ActorContext,
		request: InlineSuggestionRequest
	): Promise<InlineSuggestionRequest | undefined> {
		if (!(await this.dependencies.preferences.get(actor)).inlineSuggestionsEnabled)
			return undefined;
		const note = await this.dependencies.noteReader.get(actor, request.noteId);
		if (note.archivedAt) return undefined;
		return { ...request, projectId: note.projectId };
	}

	private key(actor: ActorContext, request: InlineSuggestionRequest): string {
		const headingPath = request.headingPath.join(' > ');
		return this.dependencies.inlineBriefKey({
			userId: actor.userId,
			noteId: request.noteId,
			projectId: request.projectId!,
			passageLength: request.currentSection.length,
			...(headingPath || request.heading ? { heading: headingPath || request.heading } : {})
		});
	}
}

const isGrounded = (brief: InlineContextBrief): boolean => brief.facts.length > 0;
