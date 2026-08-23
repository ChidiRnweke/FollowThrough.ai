import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type {
	Suggestion,
	SuggestionId,
	SuggestionProposal,
	SuggestionStatus,
	SuggestionView
} from '$lib/models/suggestions';

export type { SuggestionProposal } from '$lib/models/suggestions';

export interface SuggestionCreator {
	create(actor: ActorContext, proposal: SuggestionProposal): Promise<Suggestion>;
}
export interface SuggestionFinder {
	get(actor: ActorContext, id: SuggestionId): Promise<Suggestion>;
}
export interface SuggestionLister {
	listByStatus(
		actor: ActorContext,
		status: SuggestionStatus,
		noteId?: NoteId
	): Promise<readonly Suggestion[]>;
	countByStatus(actor: ActorContext, status: SuggestionStatus): Promise<number>;
}
export interface SuggestionViewAssembler {
	assemble(
		actor: ActorContext,
		suggestions: readonly Suggestion[]
	): Promise<readonly SuggestionView[]>;
}
export interface SuggestionAccepter {
	accept(
		actor: ActorContext,
		suggestion: Suggestion,
		appliedArtifactId: string,
		autoAccepted: boolean
	): Promise<Suggestion>;
}
export interface SuggestionRejecter {
	reject(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion>;
}
export interface SuggestionReverter {
	revert(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion>;
}
export interface SuggestionExpirer {
	expire(actor: ActorContext): Promise<number>;
}
