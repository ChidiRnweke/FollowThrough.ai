import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import { RelationshipRecords } from '$lib/server/repositories/relationships/postgres/relationships';
import { RelationshipGraph } from '$lib/server/services/relationships/graph';
import { RelationshipDiscovery } from '$lib/server/services/relationships/discovery';
import { RelationshipRules } from '$lib/server/services/relationships/rules';
import { RelationshipLanguageModel } from '$lib/server/repositories/relationships/classification';
import { operationObserver } from '$lib/server/services/telemetry';
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

export interface RelationshipsCapability {
	readonly graph: RelationshipGraph;
	readonly classifier: RelationshipDiscovery;
	readonly rules: RelationshipRules;
	readonly generation: SelectionGeneration;
}

export const createRelationshipsCapability = (
	input: RelationshipsCapabilityInput
): RelationshipsCapability => ({
	classifier: new RelationshipDiscovery(
		new RelationshipLanguageModel(input.openRouterApiKey, {
			baseURL: input.openRouterBaseURL,
			appURL: input.appURL,
			observer: operationObserver
		})
	),
	rules: new RelationshipRules(),
	generation: input.openRouterApiKey
		? { kind: 'model', model: input.defaultModel }
		: { kind: 'rules' },
	graph: new RelationshipGraph(
		new RelationshipRecords(input.db),
		input.notes,
		input.anchors,
		input.provenance
	)
});
