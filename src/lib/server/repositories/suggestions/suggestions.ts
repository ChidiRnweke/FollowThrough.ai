import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { NoteId } from '$lib/models/notes';
import type { Suggestion, SuggestionId, SuggestionStatus } from '$lib/models/suggestions';

export type SuggestionTransition = Partial<
	Pick<Suggestion, 'status' | 'decidedAt' | 'appliedArtifactId' | 'isAutoAccepted' | 'updatedAt'>
> & { readonly appliedArtifactType?: Suggestion['kind'] };

export interface SuggestionRepository {
	findById(actor: ActorContext, id: SuggestionId): Promise<Suggestion | undefined>;
	list(
		actor: ActorContext,
		filter: { noteId?: NoteId; status?: SuggestionStatus }
	): Promise<readonly Suggestion[]>;
	insert(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion>;
	transition(
		actor: ActorContext,
		id: SuggestionId,
		expectedStatus: SuggestionStatus,
		patch: SuggestionTransition
	): Promise<Suggestion | undefined>;
	expireProposedThrough(actor: ActorContext, through: DateTime): Promise<number>;
}
