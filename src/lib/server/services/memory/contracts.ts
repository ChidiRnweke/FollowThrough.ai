import type { AppliedChange } from '$lib/models/proposal-effects';
import type { ActorContext } from '$lib/models/identity';
import type {
	CreateMemoryEntryInput,
	MemoryChangePayload,
	MemoryEntry,
	MemoryEntryId,
	MemoryApplication,
	UpdateMemoryEntryInput
} from '$lib/models/memory';
import type { ProvenanceId } from '$lib/models/provenance';
import type { MemoryEntryListFilter } from '$lib/server/repositories/memory';

export interface MemoryEntryReader {
	get(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<MemoryEntry>;
}
export interface MemoryEntryLister {
	list(actor: ActorContext, filter: MemoryEntryListFilter): Promise<readonly MemoryEntry[]>;
}
export interface MemoryEntryCreator {
	create(actor: ActorContext, input: CreateMemoryEntryInput): Promise<MemoryEntry>;
}
export interface MemoryEntryEditor {
	update(actor: ActorContext, input: UpdateMemoryEntryInput): Promise<MemoryEntry>;
}
export interface MemoryEntryDeleter {
	remove(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<MemoryEntry>;
}
export interface MemoryChanges {
	validate(actor: ActorContext, payload: MemoryChangePayload): Promise<void>;
	apply(
		actor: ActorContext,
		payload: MemoryChangePayload,
		provenanceId: ProvenanceId
	): Promise<MemoryApplication<AppliedChange<MemoryEntry>>>;
}
export interface MemoryIndexer {
	index(actor: ActorContext, entry: MemoryEntry): Promise<void>;
}
