import { SvelteDate, createSubscriber } from 'svelte/reactivity';
import type { WorkspaceEnvironment, WorkspaceEvents } from '$lib/controllers/workspace/workspace';
import type { DateTime } from '$lib/models/workspace';
import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';

/** A tab: its account cookie, connectivity, a controllable clock and the account writer lock. */
export class InMemoryWorkspaceEnvironment implements WorkspaceEnvironment {
	readonly scheduler = new InMemorySyncScheduler();
	readonly events: WorkspaceEvents[] = [];
	reloads = 0;
	online = true;
	fixedNow: DateTime | null = null;
	constructor(
		public accountId: string | null,
		/** Tabs that share this map share the account writer lock. */
		private readonly waiting = new Map<string, Promise<void>>()
	) {}
	explain(error: unknown, fallback: string): string {
		return error instanceof Error ? error.message : fallback;
	}
	reload(): void {
		this.reloads++;
	}
	listen(events: WorkspaceEvents): () => void {
		this.events.push(events);
		return () => {
			this.events.splice(this.events.indexOf(events), 1);
		};
	}
	now(): DateTime {
		return this.fixedNow ?? (new SvelteDate().toISOString() as DateTime);
	}
	operationId(): string {
		return crypto.randomUUID();
	}
	snapshot<T>(value: T): T {
		return $state.snapshot(value) as T;
	}
	observe(start: () => void): () => void {
		return createSubscriber(start);
	}
	clock(): number {
		return this.scheduler.now();
	}
	schedule(at: number, work: () => Promise<void>): () => void {
		return this.scheduler.schedule(at, work);
	}
	async tryWriterLock<T>(
		accountId: string,
		work: () => Promise<T>
	): Promise<{ kind: 'acquired'; value: T } | { kind: 'busy' }> {
		if (this.waiting.has(accountId)) return { kind: 'busy' };
		return { kind: 'acquired', value: await this.writerLock(accountId, work) };
	}
	async writerLock<T>(accountId: string, work: () => Promise<T>): Promise<T> {
		const previous = this.waiting.get(accountId) ?? Promise.resolve();
		const released = Promise.withResolvers<void>();
		this.waiting.set(accountId, released.promise);
		await previous;
		try {
			return await work();
		} finally {
			released.resolve();
			if (this.waiting.get(accountId) === released.promise) this.waiting.delete(accountId);
		}
	}
}
