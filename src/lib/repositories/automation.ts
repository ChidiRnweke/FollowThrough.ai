import type {
	ActorContext,
	Conversation,
	ConversationId,
	Message,
	NoteId,
	PipelineKind,
	Provenance,
	ProvenanceId,
	Skill,
	SkillSummary,
	SkillUsage,
	SourceAnchor,
	SourceAnchorId,
	Suggestion,
	SuggestionId,
	SuggestionStatus,
	TrustPolicy
} from '../models';

export interface SkillRepository {
	findByNoteId(actor: ActorContext, noteId: NoteId): Promise<Skill | undefined>;
	listEnabled(actor: ActorContext): Promise<readonly SkillSummary[]>;
	insert(actor: ActorContext, skill: Skill): Promise<Skill>;
	update(actor: ActorContext, skill: Skill): Promise<Skill>;
	recordUsage(actor: ActorContext, usage: SkillUsage): Promise<SkillUsage>;
	listUsages(actor: ActorContext, noteId: NoteId): Promise<readonly SkillUsage[]>;
}
export interface SuggestionRepository {
	findById(actor: ActorContext, id: SuggestionId): Promise<Suggestion | undefined>;
	list(
		actor: ActorContext,
		filter: { noteId?: NoteId; status?: SuggestionStatus }
	): Promise<readonly Suggestion[]>;
	insert(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion>;
	update(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion>;
}
export interface AnchorRepository {
	findById(actor: ActorContext, id: SourceAnchorId): Promise<SourceAnchor | undefined>;
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly SourceAnchor[]>;
	insert(actor: ActorContext, anchor: SourceAnchor): Promise<SourceAnchor>;
	update(actor: ActorContext, anchor: SourceAnchor): Promise<SourceAnchor>;
}
export interface ProvenanceRepository {
	findById(actor: ActorContext, id: ProvenanceId): Promise<Provenance | undefined>;
	insert(actor: ActorContext, provenance: Provenance): Promise<Provenance>;
}
export interface TrustPolicyRepository {
	find(actor: ActorContext, pipeline: PipelineKind): Promise<TrustPolicy | undefined>;
	list(actor: ActorContext): Promise<readonly TrustPolicy[]>;
	upsert(actor: ActorContext, policy: TrustPolicy): Promise<TrustPolicy>;
}
export interface ConversationRepository {
	findById(actor: ActorContext, id: ConversationId): Promise<Conversation | undefined>;
	insert(actor: ActorContext, conversation: Conversation): Promise<Conversation>;
	update(actor: ActorContext, conversation: Conversation): Promise<Conversation>;
	appendMessage(actor: ActorContext, message: Message): Promise<Message>;
	listMessages(actor: ActorContext, id: ConversationId): Promise<readonly Message[]>;
}
