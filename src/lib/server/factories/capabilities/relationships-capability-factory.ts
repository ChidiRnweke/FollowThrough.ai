import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import { RelationshipRecords } from '$lib/server/repositories/relationships/postgres/relationships';
import {
	RelationshipWritingService,
	RelationshipReadingService,
	NoteLinkReconciliationService,
	type RelationshipCreator,
	type RelationshipFinder,
	type BacklinkContextReader,
	type NoteLinkReconciler
} from '$lib/server/services/relationships/graph';
import type { NoteRelationshipRepository } from '$lib/server/repositories/relationships/relationships';
import {
	RelationshipDiscovery,
	type RelationshipClassifier
} from '$lib/server/services/relationships/discovery';
import {
	RelationshipRules,
	type RelationshipRuleClassifier
} from '$lib/server/services/relationships/rules';
import { RelationshipLanguageModel } from '$lib/server/repositories/relationships/classification';
import { createTelemetryCapability } from '$lib/server/factories/telemetry';
import type { SelectionGeneration } from '$lib/models/agent';

export interface RelationshipsCapabilityInput {
	readonly db: Database;
	readonly notes: NoteRepository;
	readonly anchors: SourceAnchorRepository;
	readonly provenance: ProvenanceRepository;
	readonly openRouterApiKey: string;
	readonly openRouterBaseURL: string;
	readonly appURL: string;
	readonly defaultModel: string;
}

export interface RelationshipsCapability extends RelationshipServices {
	readonly classifier: RelationshipClassifier;
	readonly rules: RelationshipRuleClassifier;
	readonly generation: SelectionGeneration;
}

export const createRelationshipsCapability = (
	input: RelationshipsCapabilityInput
): RelationshipsCapability => ({
	classifier: new RelationshipDiscovery(
		new RelationshipLanguageModel(input.openRouterApiKey, {
			baseURL: input.openRouterBaseURL,
			appURL: input.appURL,
			observer: createTelemetryCapability().operations
		})
	),
	rules: new RelationshipRules(),
	generation: input.openRouterApiKey
		? { kind: 'model', model: input.defaultModel }
		: { kind: 'rules' },
	...createRelationshipServices(
		new RelationshipRecords(input.db),
		input.notes,
		input.anchors,
		input.provenance
	)
});

export interface RelationshipServices {
	readonly creator: RelationshipCreator;
	readonly finder: RelationshipFinder;
	readonly contexts: BacklinkContextReader;
	readonly reconciler: NoteLinkReconciler;
}
export const createRelationshipServices = (
	relationships: NoteRelationshipRepository,
	notes: NoteRepository,
	anchors: SourceAnchorRepository,
	provenance: ProvenanceRepository
): RelationshipServices => {
	const reading = new RelationshipReadingService(relationships, notes);
	return {
		creator: new RelationshipWritingService(relationships, notes, anchors, provenance),
		finder: reading,
		contexts: reading,
		reconciler: new NoteLinkReconciliationService(relationships, notes)
	};
};
