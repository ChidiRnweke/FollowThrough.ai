import type {
	OutboxTable,
	OutboxTransaction,
	WorkspaceReplicaRepository
} from '$lib/client/repositories/workspace/replica';
import type { OutboxEntry, WriteDraft, WriteReceipt } from '$lib/models/outbox';
import type { CacheCommit, CachedRecord, ResourceState, SyncCheckpoint } from '$lib/models/sync';
import type { WorkspaceLocalProjection } from '$lib/models/workspace-local';

interface Tables<C, T> {
	records: Map<string, ResourceState<T>>;
	checkpoint: SyncCheckpoint | null;
	outbox: readonly OutboxEntry<C, T>[];
	receipts: Map<string, WriteReceipt<T>>;
}

const version = <T>(state: ResourceState<T>): bigint =>
	BigInt((state.kind === 'present' ? state.snapshot.etag : state.etag).slice(8));
const newer = <T>(current: ResourceState<T> | undefined, incoming: ResourceState<T>) =>
	!current ||
	version(incoming) > version(current) ||
	(version(incoming) === version(current) && incoming.kind === 'deleted');

/**
 * IndexedDB as the replica sees it: one transaction applies whole or not at all, and a read
 * reports the stored projection to observers the way Dexie's live query does.
 */
export class InMemoryWorkspaceReplica<C, T> implements WorkspaceReplicaRepository<C, T> {
	private readonly accounts = new Map<string, Tables<C, T>>();
	private readonly observers = new Map<
		string,
		Set<(projection: WorkspaceLocalProjection<C, T>) => void>
	>();
	private sequence = 0;
	/** IndexedDB runs overlapping read-write transactions one after another. */
	private writes: Promise<unknown> = Promise.resolve();
	private serialized<R>(work: () => Promise<R>): Promise<R> {
		const result = this.writes.then(work);
		// chisel-ignore fail-loudly:silent-catch -- the chain only orders later writes; the caller awaits `result` and receives its rejection.
		this.writes = result.catch(() => undefined);
		return result;
	}
	private observationsPaused = false;
	private readPause: { started(): void; ready: Promise<void> } | null = null;
	private transactionPause: { skip: number; started(): void; ready: Promise<void> } | null = null;
	readonly opened = new Set<string>();
	/** A cache commit fails with this message. */
	writeFailure: string | null = null;
	/** Reading the projection fails with this message. */
	readFailure: string | null = null;
	/** An outbox transaction for a resource key fails with its message. */
	readonly transactionFailures = new Map<string, string>();

	private tables(accountId: string): Tables<C, T> {
		let tables = this.accounts.get(accountId);
		if (!tables) {
			tables = { records: new Map(), checkpoint: null, outbox: [], receipts: new Map() };
			this.accounts.set(accountId, tables);
		}
		return tables;
	}
	pauseObservations(): void {
		this.observationsPaused = true;
	}
	resumeObservations(): void {
		this.observationsPaused = false;
	}
	pauseNextRead(): { started: Promise<void>; release(): void } {
		const started = Promise.withResolvers<void>();
		const ready = Promise.withResolvers<void>();
		this.readPause = { started: started.resolve, ready: ready.promise };
		return { started: started.promise, release: ready.resolve };
	}
	/** Holds a transaction before it starts, after letting `skip` earlier ones run. */
	pauseTransaction(skip = 0): { started: Promise<void>; release(): void } {
		const started = Promise.withResolvers<void>();
		const ready = Promise.withResolvers<void>();
		this.transactionPause = { skip, started: started.resolve, ready: ready.promise };
		return { started: started.promise, release: ready.resolve };
	}

	open(accountId: string): void {
		this.opened.add(accountId);
	}
	close(accountId: string): void {
		this.opened.delete(accountId);
	}
	async read(accountId: string): Promise<WorkspaceLocalProjection<C, T>> {
		if (this.readFailure) throw new Error(this.readFailure);
		const tables = this.tables(accountId);
		const projection: WorkspaceLocalProjection<C, T> = {
			cache: {
				records: [...tables.records].map(([key, entry]) => ({ key, entry })),
				cursor: tables.checkpoint?.cursor ?? null,
				inventoryComplete: tables.checkpoint?.inventoryComplete ?? false
			},
			writes: { entries: tables.outbox, receipts: new Map(tables.receipts) }
		};
		const paused = this.readPause;
		this.readPause = null;
		if (paused) {
			paused.started();
			await paused.ready;
		}
		if (!this.observationsPaused)
			for (const observer of this.observers.get(accountId) ?? []) observer(projection);
		return projection;
	}
	observe(
		accountId: string,
		changed: (projection: WorkspaceLocalProjection<C, T>) => void
	): () => void {
		const observers = this.observers.get(accountId) ?? new Set();
		observers.add(changed);
		this.observers.set(accountId, observers);
		return () => {
			observers.delete(changed);
		};
	}
	async commitCache(accountId: string, commit: CacheCommit<T>): Promise<void> {
		return this.serialized(async () => this.applyCache(accountId, commit));
	}
	private applyCache(accountId: string, commit: CacheCommit<T>): void {
		if (this.writeFailure) throw new Error(this.writeFailure);
		const keys = commit.put.map((row) => row.key);
		if (new Set(keys).size !== keys.length)
			throw new Error('A cache commit must touch each resource only once');
		const tables = this.tables(accountId);
		for (const row of commit.put)
			if (newer(tables.records.get(row.key), row.entry)) tables.records.set(row.key, row.entry);
		const checkpoint = commit.checkpoint;
		if (
			checkpoint &&
			(tables.checkpoint === null || BigInt(checkpoint.cursor) >= BigInt(tables.checkpoint.cursor))
		)
			tables.checkpoint = {
				cursor: checkpoint.cursor,
				inventoryComplete:
					tables.checkpoint?.inventoryComplete === true || checkpoint.inventoryComplete
			};
	}
	async list(accountId: string): Promise<readonly OutboxEntry<C, T>[]> {
		return this.tables(accountId).outbox;
	}
	validate(): void {}
	transaction<R>(
		accountId: string,
		tables: readonly OutboxTable[],
		work: (tx: OutboxTransaction<C, T>) => Promise<R>
	): Promise<R> {
		return this.serialized(() => this.transact(accountId, tables, work));
	}
	private async transact<R>(
		accountId: string,
		tables: readonly OutboxTable[],
		work: (tx: OutboxTransaction<C, T>) => Promise<R>
	): Promise<R> {
		const paused =
			this.transactionPause && this.transactionPause.skip-- === 0 ? this.transactionPause : null;
		if (paused) this.transactionPause = null;
		if (paused) {
			paused.started();
			await paused.ready;
		}
		const stored = this.tables(accountId);
		const draft: Tables<C, T> = {
			records: new Map(stored.records),
			checkpoint: stored.checkpoint,
			outbox: stored.outbox,
			receipts: new Map(stored.receipts)
		};
		const sequence = this.sequence;
		try {
			const result = await work({
				entries: async () => draft.outbox,
				receipt: async (key) => draft.receipts.get(key) ?? null,
				resource: async (key) => draft.records.get(key),
				allocate: async (allocated: WriteDraft<C, T>) => {
					const failure = this.transactionFailures.get(allocated.key);
					if (failure) throw new Error(failure);
					return ++this.sequence;
				},
				removeAllocated: async () => undefined,
				replace: async (_previous, next) => {
					draft.outbox = next;
				},
				putReceipt: async (key, receipt) => {
					draft.receipts.set(key, receipt);
				},
				receiveResource: async (key, entry) => {
					if (newer(draft.records.get(key), entry)) draft.records.set(key, entry);
				}
			});
			const current = this.tables(accountId);
			if (tables.includes('records')) current.records = draft.records;
			if (tables.includes('outbox')) current.outbox = draft.outbox;
			if (tables.includes('receipts')) current.receipts = draft.receipts;
			return result;
		} catch (error) {
			this.sequence = sequence;
			throw error;
		}
	}
	async exportAccount(accountId: string): Promise<Blob> {
		const tables = this.tables(accountId);
		return new Blob([JSON.stringify({ outbox: tables.outbox })], { type: 'application/json' });
	}
	async resetAccount(accountId: string): Promise<void> {
		this.close(accountId);
		this.accounts.delete(accountId);
	}

	/** Another tab's or an earlier session's stored resource. */
	seed(accountId: string, records: readonly CachedRecord<T>[], checkpoint?: SyncCheckpoint): void {
		const tables = this.tables(accountId);
		for (const row of records) tables.records.set(row.key, row.entry);
		if (checkpoint) tables.checkpoint = checkpoint;
	}
	/** Another tab's queued write, stored as that tab's outbox stored it. */
	queue(accountId: string, entry: Omit<OutboxEntry<C, T>, 'sequence'>): OutboxEntry<C, T> {
		const tables = this.tables(accountId);
		const queued = { ...entry, sequence: ++this.sequence };
		tables.outbox = [...tables.outbox, queued];
		return queued;
	}
	entries(accountId: string): readonly OutboxEntry<C, T>[] {
		return this.tables(accountId).outbox;
	}
	resource(accountId: string, key: string): ResourceState<T> | undefined {
		return this.tables(accountId).records.get(key);
	}
	receipt(accountId: string, key: string): WriteReceipt<T> | undefined {
		return this.tables(accountId).receipts.get(key);
	}
}
