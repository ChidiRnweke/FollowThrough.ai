import type { ActorContext, NoteId, Suggestion, SuggestionId, SuggestionStatus } from '../models';
export interface SuggestionRepository {
	findById(actor: ActorContext, id: SuggestionId): Promise<Suggestion | undefined>;
	list(
		actor: ActorContext,
		filter: { noteId?: NoteId; status?: SuggestionStatus }
	): Promise<readonly Suggestion[]>;
	insert(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion>;
	update(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion>;
}
export interface SuggestionExpiryStore {
	listExpiredProposed(actor: ActorContext, through: string): Promise<readonly Suggestion[]>;
	markExpired(actor: ActorContext, ids: readonly SuggestionId[]): Promise<void>;
}
