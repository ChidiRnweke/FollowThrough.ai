import type { ActorContext } from '$lib/models/identity';
import type { MemoryEntry, MemoryEntryId } from '$lib/models/memory';
import type { ProjectId } from '$lib/models/projects';

export interface MemoryEntryListFilter {
	/** Omit projectId to list user-profile entries (those without a project). */
	readonly projectId?: ProjectId;
	readonly includeDeleted?: boolean;
}

export interface MemoryEntryRepository {
	findById(actor: ActorContext, id: MemoryEntryId): Promise<MemoryEntry | undefined>;
	list(actor: ActorContext, filter: MemoryEntryListFilter): Promise<readonly MemoryEntry[]>;
	insert(actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry>;
	update(actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry>;
}
