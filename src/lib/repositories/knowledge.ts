import type {
	ActorContext,
	Entity,
	EntityId,
	EntityType,
	NoteId,
	NoteRelationship,
	RelationshipId,
	SearchDocument,
	SearchMatch,
	SourceAnchorId
} from '../models';

export interface EntityRepository {
	findById(actor: ActorContext, id: EntityId): Promise<Entity | undefined>;
	findByName(actor: ActorContext, type: EntityType, name: string): Promise<Entity | undefined>;
	list(actor: ActorContext, type?: EntityType): Promise<readonly Entity[]>;
	insert(actor: ActorContext, entity: Entity): Promise<Entity>;
	update(actor: ActorContext, entity: Entity): Promise<Entity>;
	linkNote(
		actor: ActorContext,
		entityId: EntityId,
		noteId: NoteId,
		anchorId?: SourceAnchorId
	): Promise<void>;
	unlinkNote(actor: ActorContext, entityId: EntityId, noteId: NoteId): Promise<void>;
}
export interface RelationshipRepository {
	findById(actor: ActorContext, id: RelationshipId): Promise<NoteRelationship | undefined>;
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRelationship[]>;
	insert(actor: ActorContext, relationship: NoteRelationship): Promise<NoteRelationship>;
	delete(actor: ActorContext, id: RelationshipId): Promise<void>;
}
export interface SearchRepository {
	replaceForNote(
		actor: ActorContext,
		noteId: NoteId,
		documents: readonly SearchDocument[]
	): Promise<void>;
	search(actor: ActorContext, query: string, limit: number): Promise<readonly SearchMatch[]>;
	deleteForNote(actor: ActorContext, noteId: NoteId): Promise<void>;
}
