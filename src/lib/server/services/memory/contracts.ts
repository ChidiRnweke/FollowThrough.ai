import type { ActorContext } from '$lib/models/identity';
import type {
	CreateMemoryEntryInput,
	MemoryChangePayload,
	MemoryEntry,
	MemoryEntryId,
	MemorySuggestion,
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
	remove(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<void>;
}
export interface MemoryChangeApplier {
	apply(
		actor: ActorContext,
		payload: MemoryChangePayload,
		provenanceId: ProvenanceId
	): Promise<MemoryEntry>;
	revert(actor: ActorContext, suggestion: MemorySuggestion): Promise<void>;
}
export interface MemoryIndexer {
	index(actor: ActorContext, entry: MemoryEntry): Promise<void>;
}
