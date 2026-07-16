import type { ActorContext, MemoryEntry, MemoryEntryId } from '$lib/models';
import type { MemoryEntryListFilter, MemoryEntryRepository } from '$lib/repositories';

export class InMemoryMemoryEntryRepository implements MemoryEntryRepository {
	entries: MemoryEntry[] = [];

	async findById(actor: ActorContext, id: MemoryEntryId): Promise<MemoryEntry | undefined> {
		return this.entries.find((entry) => entry.id === id && entry.userId === actor.userId);
	}

	async list(
		actor: ActorContext,
		filter: MemoryEntryListFilter
	): Promise<readonly MemoryEntry[]> {
		return this.entries.filter(
			(entry) =>
				entry.userId === actor.userId &&
				entry.projectId === filter.projectId &&
				(filter.includeDeleted === true || entry.deletedAt === undefined)
		);
	}

	async insert(_actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry> {
		this.entries.push(entry);
		return entry;
	}

	async update(_actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry> {
		this.entries = this.entries.map((item) => (item.id === entry.id ? entry : item));
		return entry;
	}
}
