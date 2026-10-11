import type { ActorContext } from '$lib/models/identity';
import { MemoryEditingService, type IMemoryEditingService } from '$lib/services/memory/edits';
import {
	MemoryPresentationService,
	type IMemoryPresentationService
} from '$lib/services/memory/presentation';
import type { Database } from '$lib/server/db';
import type { ProjectRepository } from '$lib/server/repositories/projects';
import type { ProvenanceRepository } from '$lib/server/repositories/provenance';
import type { MemoryEntryRepository } from '$lib/server/repositories/memory';
import { MemoryRecords } from '$lib/server/repositories/memory/postgres/memory-entries';
import { MemoryLibraryService, MemoryProposalService } from '$lib/server/services/memory/library';
import type { MemoryLibrary, MemoryChanges } from '$lib/server/services/memory/library';
export interface MemoryCapabilityInput {
	readonly db: Database;
	readonly projects: ProjectRepository;
	readonly provenance: ProvenanceRepository;
}
export interface MemoryCapability {
	readonly editing: IMemoryEditingService;
	readonly presentation: IMemoryPresentationService;
	readonly library: MemoryLibrary;
	readonly changes: MemoryChanges;
}
export const createMemoryServices = (
	actor: ActorContext,
	entries: MemoryEntryRepository,
	projects: ProjectRepository,
	provenance: ProvenanceRepository
): MemoryCapability => {
	return {
		editing: new MemoryEditingService(),
		presentation: new MemoryPresentationService(),
		library: new MemoryLibraryService(actor, entries, projects),
		changes: new MemoryProposalService(actor, entries, projects, provenance)
	};
};
export const createMemoryCapability = (
	actor: ActorContext,
	input: MemoryCapabilityInput
): MemoryCapability =>
	createMemoryServices(actor, new MemoryRecords(actor, input.db), input.projects, input.provenance);
