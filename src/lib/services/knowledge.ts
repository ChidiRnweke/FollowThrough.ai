import type {
	ActorContext,
	CreateReferenceInput,
	CreateRelationshipInput,
	Entity,
	EntityId,
	EntityType,
	ExternalReference,
	LinkCandidate,
	NoteId,
	NoteRelationship,
	PromiseCandidate,
	ReferenceCandidate,
	SearchMatch,
	SourceAnchor,
	TextSelection
} from '../models';
export interface EntityCreator {
	create(
		actor: ActorContext,
		input: { type: EntityType; name: string; description?: string }
	): Promise<Entity>;
}
export interface EntityEditor {
	update(actor: ActorContext, entity: Entity): Promise<Entity>;
}
export interface EntityLinker {
	linkNote(
		actor: ActorContext,
		entityId: EntityId,
		noteId: NoteId,
		anchorId?: SourceAnchor['id']
	): Promise<void>;
}
export interface EntityFinder {
	find(
		actor: ActorContext,
		query: string,
		types?: readonly EntityType[]
	): Promise<readonly Entity[]>;
}
export interface EntityMentionExtractor {
	extract(
		actor: ActorContext,
		text: string
	): Promise<readonly { type: EntityType; name: string }[]>;
}
export interface LinkFinder {
	find(actor: ActorContext, selection: TextSelection): Promise<readonly LinkCandidate[]>;
}
export interface RelationshipCreator {
	create(actor: ActorContext, input: CreateRelationshipInput): Promise<NoteRelationship>;
}
export interface RelationshipFinder {
	findForNote(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRelationship[]>;
}
export interface DecisionHistoryFinder {
	find(actor: ActorContext, entityId: EntityId): Promise<readonly NoteRelationship[]>;
}
export interface ContradictionFinder {
	find(actor: ActorContext, entityId: EntityId): Promise<readonly NoteRelationship[]>;
}
export interface PromiseExtractor {
	extract(actor: ActorContext, selection: TextSelection): Promise<readonly PromiseCandidate[]>;
}
export interface ReferenceFinder {
	find(actor: ActorContext, selection: TextSelection): Promise<readonly ReferenceCandidate[]>;
}
export interface ReferenceRanker {
	rank(
		actor: ActorContext,
		selection: TextSelection,
		candidates: readonly ReferenceCandidate[]
	): Promise<readonly ReferenceCandidate[]>;
}
export interface ReferenceCreator {
	create(actor: ActorContext, input: CreateReferenceInput): Promise<ExternalReference>;
}
export interface KnowledgeSearcher {
	search(actor: ActorContext, query: string, limit?: number): Promise<readonly SearchMatch[]>;
}
