import type {
	ActorContext,
	CreateReferenceInput,
	ExternalReference,
	NoteId,
	ReferenceCandidate,
	ReferenceId,
	TextSelection
} from '$lib/models';

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
