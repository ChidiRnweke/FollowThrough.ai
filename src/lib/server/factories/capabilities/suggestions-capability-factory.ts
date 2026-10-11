import { WorkspaceSyncObjects } from '$lib/server/repositories/workspace/sync-objects';
import {
	SuggestionPresentationService,
	type ISuggestionPresentationService
} from '$lib/services/suggestions/presentation';
import {
	SuggestionEffects,
	type SuggestionEffectService
} from '$lib/server/services/suggestions/effects';
import { SuggestionEffectRecords } from '$lib/server/repositories/suggestions/postgres/application-effects';
import type { Database } from '$lib/server/db';
import type { DateTime } from '$lib/models/workspace';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import type { SuggestionRepository } from '$lib/server/repositories/suggestions/suggestions';
import { SuggestionRecords } from '$lib/server/repositories/suggestions/postgres/suggestions';
import {
	SuggestionCreationService,
	SuggestionReadingService,
	SuggestionContextService,
	SuggestionLifecycleService,
	type Clock,
	type SuggestionCreator,
	type SuggestionFinder,
	type SuggestionLister,
	type SuggestionContextReader,
	type SuggestionAccepter,
	type SuggestionRejecter,
	type SuggestionReverter,
	type SuggestionExpirer
} from '$lib/server/services/suggestions/inbox';

export interface SuggestionsCapabilityInput {
	readonly db: Database;
	readonly notes: NoteRepository;
	readonly provenance: ProvenanceRepository;
	readonly anchors: SourceAnchorRepository;
}
export interface SuggestionServices {
	readonly creator: SuggestionCreator;
	readonly finder: SuggestionFinder;
	readonly lister: SuggestionLister;
	readonly context: SuggestionContextReader;
	readonly accepter: SuggestionAccepter;
	readonly rejecter: SuggestionRejecter;
	readonly reverter: SuggestionReverter;
	readonly expirer: SuggestionExpirer;
}
export interface SuggestionsCapability extends SuggestionServices {
	readonly presentation: ISuggestionPresentationService;
	readonly effects: SuggestionEffectService;
}
export const createSuggestionServices = (
	records: SuggestionRepository,
	notes: NoteRepository,
	provenance: ProvenanceRepository,
	anchors: SourceAnchorRepository,
	clock: Clock = { now: () => new Date().toISOString() as DateTime }
): SuggestionServices => {
	const reading = new SuggestionReadingService(records);
	const lifecycle = new SuggestionLifecycleService(records, clock);
	return {
		creator: new SuggestionCreationService(records, notes, provenance, anchors, clock),
		finder: reading,
		lister: reading,
		context: new SuggestionContextService(notes, provenance, anchors),
		accepter: lifecycle,
		rejecter: lifecycle,
		reverter: lifecycle,
		expirer: lifecycle
	};
};
export const createSuggestionsCapability = (
	input: SuggestionsCapabilityInput
): SuggestionsCapability => ({
	...createSuggestionServices(
		new SuggestionRecords(input.db),
		input.notes,
		input.provenance,
		input.anchors
	),
	presentation: new SuggestionPresentationService(),
	effects: new SuggestionEffects(
		new SuggestionEffectRecords(input.db, new WorkspaceSyncObjects(input.db))
	)
});
