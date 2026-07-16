import type { ActorContext, MemoryEntry, MemoryEntryId, ProjectId } from '../models';

export interface MemoryEntryListFilter {
	readonly projectId: ProjectId;
	readonly includeDeleted?: boolean;
}

export interface MemoryEntryRepository {
	findById(actor: ActorContext, id: MemoryEntryId): Promise<MemoryEntry | undefined>;
	list(actor: ActorContext, filter: MemoryEntryListFilter): Promise<readonly MemoryEntry[]>;
	insert(actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry>;
	update(actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry>;
}
