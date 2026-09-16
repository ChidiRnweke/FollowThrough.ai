import type { ActorContext } from '$lib/models/identity';
import type { MemoryEntryListFilter } from '$lib/server/repositories/memory';
import { InMemoryMemoryEntryRepository } from './in-memory-memory-repository';

/** Holds a profile-memory read open so cancellation can race context preparation. */
export class InMemoryGatedMemoryEntries extends InMemoryMemoryEntryRepository {
	private entered!: () => void;
	private released!: () => void;
	readonly started = new Promise<void>((resolve) => {
		this.entered = resolve;
	});
	private readonly gate = new Promise<void>((resolve) => {
		this.released = resolve;
	});

	release(): void {
		this.released();
	}

	override async list(actor: ActorContext, filter: MemoryEntryListFilter) {
		this.entered();
		await this.gate;
		return super.list(actor, filter);
	}
}
