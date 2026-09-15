import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type {
	Suggestion,
	SelectionProposal,
	ProposalSelectionOrigin,
	SuggestionId,
	SuggestionProposal,
	SuggestionStatus,
	SuggestionView
} from '$lib/models/suggestions';

export type { SuggestionProposal } from '$lib/models/suggestions';

export interface SuggestionCreator {
	create<P extends SuggestionProposal>(
		actor: ActorContext,
		proposal: P
	): Promise<Extract<Suggestion, { kind: P['kind'] }>>;
	createFromSelection<P extends SelectionProposal>(
		actor: ActorContext,
		origin: ProposalSelectionOrigin,
		proposal: P
	): Promise<Extract<Suggestion, { kind: P['kind'] }>>;
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
