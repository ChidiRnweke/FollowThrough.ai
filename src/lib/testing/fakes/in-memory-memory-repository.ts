import type { ActorContext, MemoryEntry, MemoryEntryId } from '$lib/models';
import type { MemoryEntryListFilter, MemoryEntryRepository } from '$lib/server/repositories';
import type { SnapshotParticipant } from './in-memory-transaction';

export class InMemoryMemoryEntryRepository implements MemoryEntryRepository, SnapshotParticipant {
	entries: MemoryEntry[] = [];

	async findById(actor: ActorContext, id: MemoryEntryId): Promise<MemoryEntry | undefined> {
		return this.entries.find((entry) => entry.id === id && entry.userId === actor.userId);
	}

	async list(actor: ActorContext, filter: MemoryEntryListFilter): Promise<readonly MemoryEntry[]> {
		// An undefined filter.projectId matches only user-profile entries, which carry no projectId.
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

	snapshot(): unknown {
		return structuredClone(this.entries);
	}

	restore(snapshot: unknown): void {
		this.entries = snapshot as MemoryEntry[];
	}
}
