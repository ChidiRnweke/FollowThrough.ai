import type { ActorContext } from '$lib/models/identity';
import type {
	CreateReferenceInput,
	ExternalReference,
	ReferenceCandidate,
	ReferenceId,
	ReferenceView
} from '$lib/models/references';
import type { NoteId, TextSelection } from '$lib/models/notes';

export interface ReferenceSearchOptions {
	readonly model?: string;
}

export interface ReferenceFinder {
	find(
		actor: ActorContext,
		selection: TextSelection,
		options?: ReferenceSearchOptions
	): Promise<readonly ReferenceCandidate[]>;
}
export interface WebReferenceClient {
	search(
		selectionText: string,
		options?: ReferenceSearchOptions
	): Promise<readonly ReferenceCandidate[] | undefined>;
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
export interface ReferenceViewAssembler {
	assemble(
		actor: ActorContext,
		references: readonly ExternalReference[]
	): Promise<readonly ReferenceView[]>;
}
