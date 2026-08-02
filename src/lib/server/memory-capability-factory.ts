import type { Database } from '$lib/server/db';
import type { ProjectRepository } from '$lib/server/repositories/projects';
import type { ProvenanceRepository } from '$lib/server/repositories/provenance';
import { MemoryRecords } from '$lib/server/repositories/memory/postgres/memory-entries';
import type { EmbeddedMemoryIndexer } from '$lib/server/services/knowledge-search/indexing';
import { MemoryLibrary } from '$lib/server/services/memory/library';

export interface MemoryCapabilityInput {
	readonly db: Database;
	readonly projects: ProjectRepository;
	readonly provenance: ProvenanceRepository;
	readonly indexer: EmbeddedMemoryIndexer;
}

export interface MemoryCapability {
	readonly library: MemoryLibrary;
}

export const createMemoryCapability = (input: MemoryCapabilityInput): MemoryCapability => ({
	library: new MemoryLibrary(
		new MemoryRecords(input.db),
		input.projects,
		input.provenance,
		input.indexer
	)
});
