import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import { RelationshipRecords } from '$lib/server/repositories/relationships/postgres/relationships';
import { RelationshipGraph } from '$lib/server/services/relationships/graph';

export interface RelationshipsCapabilityInput {
	readonly db: Database;
	readonly notes: NoteRepository;
	readonly anchors: SourceAnchorRepository;
	readonly provenance: ProvenanceRepository;
}

export interface RelationshipsCapability {
	readonly graph: RelationshipGraph;
}

export const createRelationshipsCapability = (
	input: RelationshipsCapabilityInput
): RelationshipsCapability => ({
	graph: new RelationshipGraph(
		new RelationshipRecords(input.db),
		input.notes,
		input.anchors,
		input.provenance
	)
});
