import type { ActorContext } from '$lib/models/identity';
import type { CreateReferenceInput } from '$lib/models/references';
import type { CreateRelationshipInput } from '$lib/models/relationships';
import type { CreateTodoInput } from '$lib/models/todos';
import type { DiagramKind } from '$lib/models/diagrams';
import type { MemoryChangePayload } from '$lib/models/memory';
import type { NoteId } from '$lib/models/notes';
import type { ProvenanceId, SourceAnchorId } from '$lib/models/provenance';
import type {
	Suggestion,
	SuggestionId,
	SuggestionStatus,
	SuggestionView
} from '$lib/models/suggestions';

export interface SuggestionProposalBase {
	readonly noteId?: NoteId;
	readonly confidence?: number;
	readonly provenanceId: ProvenanceId;
	readonly sourceAnchorId?: SourceAnchorId;
}
export type SuggestionProposal =
	| (SuggestionProposalBase & { readonly kind: 'todo'; readonly payload: CreateTodoInput })
	| (SuggestionProposalBase & {
			readonly kind: 'backlink';
			readonly payload: CreateRelationshipInput;
	  })
	| (SuggestionProposalBase & {
			readonly kind: 'reference';
			readonly payload: CreateReferenceInput;
	  })
	| (SuggestionProposalBase & {
			readonly kind: 'diagram';
			readonly payload: { noteId: NoteId; kind: DiagramKind; title?: string; source: string };
	  })
	| (SuggestionProposalBase & { readonly kind: 'memory'; readonly payload: MemoryChangePayload });

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
