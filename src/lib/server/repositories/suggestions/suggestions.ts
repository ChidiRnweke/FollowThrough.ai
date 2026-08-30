import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { NoteId } from '$lib/models/notes';
import type {
	StoredSuggestion,
	Suggestion,
	SuggestionId,
	SuggestionStatus
} from '$lib/models/suggestions';

export type SuggestionTransition = Partial<
	Pick<Suggestion, 'status' | 'decidedAt' | 'appliedArtifactId' | 'isAutoAccepted' | 'updatedAt'>
> & { readonly appliedArtifactType?: Suggestion['kind'] };

/** `transition` is a compare-and-swap on `expectedStatus`: a double accept or a decision on an already-decided suggestion fails instead of silently winning. */
export interface SuggestionRepository {
	findById(actor: ActorContext, id: SuggestionId): Promise<Suggestion | undefined>;
	/**
	 * Reports rows it could not read rather than throwing on them: this maps many
	 * rows, and one unreadable payload must not cost the caller the whole list.
	 * The service decides what to do with them.
	 */
	list(
		actor: ActorContext,
		filter: { noteId?: NoteId; status?: SuggestionStatus }
	): Promise<readonly StoredSuggestion[]>;
	insert(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion>;
	transition(
		actor: ActorContext,
		id: SuggestionId,
		expectedStatus: SuggestionStatus,
		patch: SuggestionTransition
	): Promise<Suggestion | undefined>;
	expireProposedThrough(actor: ActorContext, through: DateTime): Promise<number>;
}
