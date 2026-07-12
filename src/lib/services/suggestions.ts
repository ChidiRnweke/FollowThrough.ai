import type {
	ActorContext,
	CreateReferenceInput,
	CreateRelationshipInput,
	CreateTodoInput,
	DiagramKind,
	NoteId,
	PipelineKind,
	Provenance,
	ProvenanceId,
	SourceAnchorId,
	Suggestion,
	SuggestionId,
	SuggestionStatus,
	SuggestionView,
	TrustPolicy,
	UpdateTrustPolicyInput
} from '../models';

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
	  });

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
export interface TrustPolicyEvaluator {
	shouldAutoAccept(
		actor: ActorContext,
		pipeline: PipelineKind,
		suggestion: Suggestion
	): Promise<boolean>;
}
export interface TrustPolicyStore {
	list(actor: ActorContext): Promise<readonly TrustPolicy[]>;
	upsert(actor: ActorContext, input: UpdateTrustPolicyInput): Promise<TrustPolicy>;
}
export interface ProvenanceRecorder {
	record(
		actor: ActorContext,
		input: Omit<Provenance, 'id' | 'userId' | 'createdAt'>
	): Promise<Provenance>;
}
