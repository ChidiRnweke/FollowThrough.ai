import type { AppliedChange } from '$lib/models/proposal-effects';
import type { ActorContext } from '$lib/models/identity';
import type {
	BacklinkContext,
	CreateRelationshipInput,
	RelationshipId,
	RelationshipClassification
} from '$lib/models/relationships';
import type { Note, NoteId, NoteRelationship } from '$lib/models/notes';
export type { StructuredRelationshipClient } from '$lib/server/repositories/relationships/classification';

export interface RelationshipClassifier {
	classify(
		sourceText: string,
		targetText: string,
		model: string,
		signal?: AbortSignal
	): Promise<RelationshipClassification>;
}
export interface RelationshipCreator {
	create(actor: ActorContext, input: CreateRelationshipInput): Promise<NoteRelationship>;
	createWithChange(
		actor: ActorContext,
		input: CreateRelationshipInput
	): Promise<AppliedChange<NoteRelationship>>;
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
export interface BacklinkContextReader {
	readContexts(
		actor: ActorContext,
		relationships: readonly NoteRelationship[]
	): Promise<readonly BacklinkContext[]>;
}
