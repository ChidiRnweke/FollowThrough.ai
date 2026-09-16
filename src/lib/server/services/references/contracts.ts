import type { ActorContext } from '$lib/models/identity';
import type {
	CreateReferenceInput,
	ExternalReference,
	ReferenceCandidate,
	ReferenceId,
	ReferenceView
} from '$lib/models/references';
import type { NoteId, TextSelection } from '$lib/models/notes';

import type { ReferenceSearchOptions } from '$lib/server/repositories/references/web-research';
export type {
	ReferenceSearchOptions,
	WebReferenceClient
} from '$lib/server/repositories/references/web-research';

export interface ReferenceFinder {
	find(
		actor: ActorContext,
		selection: TextSelection,
		options?: ReferenceSearchOptions
	): Promise<readonly ReferenceCandidate[]>;
}
export interface ReferenceRanker {
	rank(candidates: readonly ReferenceCandidate[]): readonly ReferenceCandidate[];
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
export interface ReferenceContextReader {
	readContexts(
		actor: ActorContext,
		references: readonly ExternalReference[]
	): Promise<readonly ReferenceView[]>;
}
