import type {
	ActorContext,
	BacklinkView,
	CreateRelationshipInput,
	LinkCandidate,
	NoteId,
	NoteRelationship,
	RelationshipId,
	RelationshipKind,
	TextSelection
} from '$lib/models';

export interface LinkFinder {
	find(actor: ActorContext, selection: TextSelection): Promise<readonly LinkCandidate[]>;
}
export interface RelationshipClassification {
	readonly kind: RelationshipKind;
	readonly justification: string;
	readonly confidence: number;
}
export interface RelationshipClassifier {
	classify(sourceText: string, targetText: string): Promise<RelationshipClassification>;
}
export interface StructuredRelationshipClient {
	classify(sourceText: string, targetText: string): Promise<RelationshipClassification | undefined>;
}
export interface RelationshipCreator {
	create(actor: ActorContext, input: CreateRelationshipInput): Promise<NoteRelationship>;
}
export interface RelationshipDeleter {
	delete(actor: ActorContext, relationshipId: RelationshipId): Promise<void>;
}
export interface RelationshipFinder {
	findForNote(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRelationship[]>;
}
export interface BacklinkViewAssembler {
	assemble(
		actor: ActorContext,
		relationships: readonly NoteRelationship[]
	): Promise<readonly BacklinkView[]>;
}
