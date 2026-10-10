import type { OutboxProjection } from '$lib/models/outbox';

/** Readonly projection and observation lifetime for one account's durable outbox. */
export class MutationQueueStore<C, T> {
	private projection: OutboxProjection<C, T> = { entries: [], receipts: new Map() };
	private generation = 0;
	private readonly subscriptions = new Set<() => void>();
	read(): OutboxProjection<C, T> {
		return this.projection;
	}
	get reloadGeneration(): number {
		return this.generation;
	}
	advanceGeneration(): number {
		return ++this.generation;
	}
	replace(projection: OutboxProjection<C, T>): void {
		this.projection = { entries: projection.entries, receipts: new Map(projection.receipts) };
		this.generation++;
	}
	clear(): void {
		this.projection = { entries: [], receipts: new Map() };
		this.generation++;
	}
	subscribe(listener: () => void): () => void {
		this.subscriptions.add(listener);
		return () => this.subscriptions.delete(listener);
	}
	listeners(): ReadonlySet<() => void> {
		return this.subscriptions;
	}
}
