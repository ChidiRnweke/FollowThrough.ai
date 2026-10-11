import type { ActorContext } from '$lib/models/identity';
import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import { RelationshipRecords } from '$lib/server/repositories/relationships/postgres/relationships';
import {
	RelationshipGraph,
	type RelationshipCreator,
	type RelationshipReader,
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
import { operationObserver } from '$lib/server/infrastructure/telemetry/tracing';
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
	actor: ActorContext,
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
	...createRelationshipServices(
		actor,
		new RelationshipRecords(actor, input.db),
		input.notes,
		input.anchors,
		input.provenance
	)
});

export interface RelationshipServices {
	readonly creator: RelationshipCreator;
	readonly reader: RelationshipReader;
	readonly reconciler: NoteLinkReconciler;
}
export const createRelationshipServices = (
	actor: ActorContext,
	relationships: NoteRelationshipRepository,
	notes: NoteRepository,
	anchors: SourceAnchorRepository,
	provenance: ProvenanceRepository
): RelationshipServices => {
	const graph = new RelationshipGraph(actor, relationships, notes, anchors, provenance);
	return { creator: graph, reader: graph, reconciler: graph };
};
