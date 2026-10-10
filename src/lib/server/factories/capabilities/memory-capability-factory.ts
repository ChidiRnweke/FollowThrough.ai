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
import {
	MemoryReadingService,
	MemoryWritingService,
	MemoryLifecycleService,
	MemoryProposalService
} from '$lib/server/services/memory/library';
import type {
	MemoryEntryReader,
	MemoryEntryLister,
	MemoryEntryCreator,
	MemoryEntryEditor,
	MemoryEntryDeleter,
	MemoryChanges
} from '$lib/server/services/memory/library';
export interface MemoryCapabilityInput {
	readonly db: Database;
	readonly projects: ProjectRepository;
	readonly provenance: ProvenanceRepository;
}
export interface MemoryCapability {
	readonly editing: IMemoryEditingService;
	readonly presentation: IMemoryPresentationService;
	readonly reader: MemoryEntryReader;
	readonly lister: MemoryEntryLister;
	readonly creator: MemoryEntryCreator;
	readonly editor: MemoryEntryEditor;
	readonly deleter: MemoryEntryDeleter;
	readonly changes: MemoryChanges;
}
export const createMemoryServices = (
	entries: MemoryEntryRepository,
	projects: ProjectRepository,
	provenance: ProvenanceRepository
): MemoryCapability => {
	const reading = new MemoryReadingService(entries, projects);
	const writing = new MemoryWritingService(entries, projects);
	return {
		editing: new MemoryEditingService(),
		presentation: new MemoryPresentationService(),
		reader: reading,
		lister: reading,
		creator: writing,
		editor: writing,
		deleter: new MemoryLifecycleService(entries, projects),
		changes: new MemoryProposalService(entries, projects, provenance)
	};
};
export const createMemoryCapability = (input: MemoryCapabilityInput): MemoryCapability =>
	createMemoryServices(new MemoryRecords(input.db), input.projects, input.provenance);
