import type { ActorContext } from '$lib/models/identity';
import type {
	BacklinkView,
	CreateRelationshipInput,
	LinkCandidate,
	RelationshipId,
	RelationshipKind
} from '$lib/models/relationships';
import type { Note, NoteId, NoteRelationship, TextSelection } from '$lib/models/notes';

export interface LinkFinder {
	find(
		actor: ActorContext,
		selection: TextSelection,
		signal?: AbortSignal
	): Promise<readonly LinkCandidate[]>;
}
export interface RelationshipClassification {
	readonly kind: RelationshipKind;
	readonly justification: string;
	readonly confidence: number;
}
export interface RelationshipClassifier {
	classify(
		sourceText: string,
		targetText: string,
		signal?: AbortSignal
	): Promise<RelationshipClassification>;
}
export interface StructuredRelationshipClient {
	classify(
		sourceText: string,
		targetText: string,
		signal?: AbortSignal
	): Promise<RelationshipClassification | undefined>;
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
/**
 * Keeps the `mentions` rows for a note equal to the links in its document.
 *
 * The document owns where a link is; these rows are the index that makes backlinks
 * queryable. Reconciling on save rather than on insert means a link deleted by editing —
 * or by an agent's `edit_note` — stops producing a backlink, which a create-only path
 * could never manage.
 */
export interface NoteLinkReconciler {
	reconcile(actor: ActorContext, note: Note, targets: readonly NoteId[]): Promise<void>;
}
export interface BacklinkViewAssembler {
	assemble(
		actor: ActorContext,
		relationships: readonly NoteRelationship[]
	): Promise<readonly BacklinkView[]>;
}
