import { SuggestionEffects } from '$lib/server/services/suggestions/effects';
import { SuggestionEffectRecords } from '$lib/server/repositories/suggestions/postgres/application-effects';
import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import { SuggestionRecords } from '$lib/server/repositories/suggestions/postgres/suggestions';
import { SuggestionApplication } from '$lib/server/services/suggestions/application';
import { ExpiringSuggestionLister } from '$lib/server/services/suggestions/expiring-lister';
import { SuggestionInbox } from '$lib/server/services/suggestions/inbox';

type ApplicationArguments = ConstructorParameters<typeof SuggestionApplication>;

export interface SuggestionsCapabilityInput {
	readonly db: Database;
	readonly notes: NoteRepository;
	readonly provenance: ProvenanceRepository;
	readonly anchors: SourceAnchorRepository;
}

export interface SuggestionsFinalizeInput {
	readonly todoCreator: ApplicationArguments[0];
	readonly relationshipCreator: ApplicationArguments[1];
	readonly referenceCreator: ApplicationArguments[2];
	readonly diagramWriter: ApplicationArguments[3];
	readonly memoryChangeApplier: ApplicationArguments[4];
	readonly drawioValidator: ApplicationArguments[5];
	readonly drawioLabels: ApplicationArguments[6];
}

export interface SuggestionsCapability {
	readonly inbox: SuggestionInbox;
	readonly effects: SuggestionEffects;
	readonly lister: ExpiringSuggestionLister;
	readonly finalize: (input: SuggestionsFinalizeInput) => SuggestionApplication;
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
		lister: new ExpiringSuggestionLister(inbox, inbox),
		finalize: (dependencies) =>
			new SuggestionApplication(
				dependencies.todoCreator,
				dependencies.relationshipCreator,
				dependencies.referenceCreator,
				dependencies.diagramWriter,
				dependencies.memoryChangeApplier,
				dependencies.drawioValidator,
				dependencies.drawioLabels,
				input.notes
			)
	};
};
