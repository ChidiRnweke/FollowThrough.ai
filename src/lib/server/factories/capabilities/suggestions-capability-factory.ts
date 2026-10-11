import type { ActorContext } from '$lib/models/identity';
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
	SuggestionInbox,
	SuggestionLifecycleService,
	type Clock,
	type SuggestionCreator,
	type SuggestionFinder,
	type SuggestionReader,
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
	readonly now: () => DateTime;
}
export interface SuggestionServices {
	readonly creator: SuggestionCreator;
	readonly finder: SuggestionFinder;
	readonly reader: SuggestionReader;
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
	actor: ActorContext,
	records: SuggestionRepository,
	notes: NoteRepository,
	provenance: ProvenanceRepository,
	anchors: SourceAnchorRepository,
	clock: Clock
): SuggestionServices => {
	const inbox = new SuggestionInbox(records, notes, provenance, anchors);
	const lifecycle = new SuggestionLifecycleService(records, clock);
	return {
		creator: new SuggestionCreationService(actor, records, notes, provenance, anchors, clock),
		finder: inbox,
		reader: inbox,
		accepter: lifecycle,
		rejecter: lifecycle,
		reverter: lifecycle,
		expirer: lifecycle
	};
};
export const createSuggestionsCapability = (
	actor: ActorContext,
	input: SuggestionsCapabilityInput
): SuggestionsCapability => ({
	...createSuggestionServices(
		actor,
		new SuggestionRecords(actor, input.db),
		input.notes,
		input.provenance,
		input.anchors,
		{ now: input.now }
	),
	presentation: new SuggestionPresentationService(),
	effects: new SuggestionEffects(
		new SuggestionEffectRecords(actor, input.db, new WorkspaceSyncObjects(actor, input.db))
	)
});
