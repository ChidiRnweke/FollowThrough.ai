import { SuggestionEffects } from '$lib/server/services/suggestions/effects';
import { SuggestionEffectRecords } from '$lib/server/repositories/suggestions/postgres/application-effects';
import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import { SuggestionRecords } from '$lib/server/repositories/suggestions/postgres/suggestions';
import { ExpiringSuggestionLister } from '$lib/server/services/suggestions/expiring-lister';
import { SuggestionInbox } from '$lib/server/services/suggestions/inbox';

export interface SuggestionsCapabilityInput {
	readonly db: Database;
	readonly notes: NoteRepository;
	readonly provenance: ProvenanceRepository;
	readonly anchors: SourceAnchorRepository;
}

export interface SuggestionsCapability {
	readonly inbox: SuggestionInbox;
	readonly effects: SuggestionEffects;
	readonly lister: ExpiringSuggestionLister;
}

export const createSuggestionsCapability = (
	input: SuggestionsCapabilityInput
): SuggestionsCapability => {
	const inbox = new SuggestionInbox(
		new SuggestionRecords(input.db),
		input.notes,
		input.provenance,
		input.anchors
	);
	return {
		inbox,
		effects: new SuggestionEffects(new SuggestionEffectRecords(input.db)),
		lister: new ExpiringSuggestionLister(inbox, inbox)
	};
};
