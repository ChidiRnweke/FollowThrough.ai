import type { AppliedChange } from '$lib/models/proposal-effects';
import type { AppliedRecord } from '$lib/server/repositories/suggestions/application-effects';
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

export interface SuggestionEffectService {
	lock(actor: ActorContext, id: SuggestionId): Promise<void>;
	record(
		actor: ActorContext,
		id: SuggestionId,
		changes: readonly AppliedChange<AppliedRecord>[]
	): Promise<void>;
	restore(actor: ActorContext, suggestion: Suggestion): Promise<readonly AppliedRecord[]>;
}
