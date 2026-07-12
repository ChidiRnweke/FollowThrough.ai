import type {
	ActorContext,
	BacklinkView,
	CreateReferenceInput,
	CreateRelationshipInput,
	ExternalReference,
	LinkCandidate,
	NoteId,
	NoteRelationship,
	PromiseCandidate,
	ReferenceCandidate,
	ReferenceId,
	RelationshipId,
	RelationshipKind,
	SearchMatch,
	TextSelection
} from '../models';
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
export interface PromiseExtractor {
	extract(actor: ActorContext, selection: TextSelection): Promise<readonly PromiseCandidate[]>;
}
export interface StructuredPromiseResult {
	readonly action: string;
	readonly ownerName: string | null;
	readonly responsibility: 'mine' | 'waiting_on';
	readonly dueDateVerbatim: string | null;
	readonly resolvedDueDate: string | null;
	readonly strength: 'explicit' | 'implied' | 'tentative';
	readonly confidence: number;
}
export interface StructuredPromiseClient {
	extract(text: string): Promise<readonly StructuredPromiseResult[] | undefined>;
}
export interface ReferenceFinder {
	find(actor: ActorContext, selection: TextSelection): Promise<readonly ReferenceCandidate[]>;
}
export interface WebReferenceClient {
	search(selectionText: string): Promise<readonly ReferenceCandidate[] | undefined>;
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
export interface ReferenceDeleter {
	delete(actor: ActorContext, referenceId: ReferenceId): Promise<void>;
}
export interface ReferenceLister {
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly ExternalReference[]>;
}
export interface KnowledgeSearcher {
	search(
		actor: ActorContext,
		query: string,
		limit?: number,
		projectId?: import('../models').ProjectId
	): Promise<readonly SearchMatch[]>;
}
export interface ContentChunker {
	chunk(content: string): readonly string[];
}
export interface EmbeddingBatch {
	readonly model: string;
	readonly vectors: readonly (readonly number[])[];
}
export interface EmbeddingClient {
	readonly model: string;
	embed(contents: readonly string[]): Promise<EmbeddingBatch>;
}
