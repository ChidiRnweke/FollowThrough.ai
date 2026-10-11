import { liveQuery, type Transaction } from 'dexie';
import { Dexie } from 'dexie';
import { z } from 'zod';
import {
	outboxEntrySchema,
	writeReceiptSchema,
	type OutboxEntry,
	type OutboxProjection,
	type WriteDraft,
	type WriteReceipt
} from '$lib/models/outbox';
import {
	syncCursorSchema,
	type CacheCommit,
	type ResourceState,
	type StoredCache,
	type SyncCheckpoint
} from '$lib/models/sync';
import type { WorkspaceLocalProjection } from '$lib/models/workspace-local';
import {
	WorkspaceDatabase,
	WorkspaceStorageError,
	accountDatabaseName,
	storedResourceSchema,
	storedTable
} from './database';

export type OutboxTable = 'outbox' | 'records' | 'receipts';

/** Every read and write of one outbox transition, inside one IndexedDB transaction. */
export interface OutboxTransaction<C, T> {
	entries(): Promise<readonly OutboxEntry<C, T>[]>;
	receipt(key: string): Promise<WriteReceipt<T> | null>;
	resource(key: string): Promise<ResourceState<T> | undefined>;
	allocate(draft: WriteDraft<C, T>): Promise<number>;
	removeAllocated(sequence: number): Promise<void>;
	replace(
		previous: readonly OutboxEntry<C, T>[],
		next: readonly OutboxEntry<C, T>[]
	): Promise<void>;
	putReceipt(key: string, receipt: WriteReceipt<T>): Promise<void>;
	/** Keeps whichever of the stored and received versions is newer. */
	receiveResource(key: string, entry: ResourceState<T>): Promise<void>;
}

/** One account's replica on this device: cached resources, queued writes and their receipts. */
export interface WorkspaceReplicaRepository<C, T> {
	open(accountId: string): void;
	close(accountId: string): void;
	read(accountId: string): Promise<WorkspaceLocalProjection<C, T>>;
	observe(
		accountId: string,
		changed: (projection: WorkspaceLocalProjection<C, T>) => void,
		failed: (error: Error) => void
	): () => void;
	commitCache(accountId: string, commit: CacheCommit<T>): Promise<void>;
	list(accountId: string): Promise<readonly OutboxEntry<C, T>[]>;
	/** Rejects invalid input before it can mark stored data as corrupt or allocate a sequence. */
	validate(draft: WriteDraft<C, T>): void;
	transaction<R>(
		accountId: string,
		tables: readonly OutboxTable[],
		work: (tx: OutboxTransaction<C, T>) => Promise<R>
	): Promise<R>;
	/** Raw storage, readable even when the replica no longer parses. */
	exportAccount(accountId: string): Promise<Blob>;
	resetAccount(accountId: string): Promise<void>;
}

const checkpointSchema = z.object({
	key: z.literal('checkpoint'),
	cursor: syncCursorSchema,
	inventoryComplete: z.boolean()
});

const version = <T>(state: ResourceState<T>): bigint =>
	BigInt((state.kind === 'present' ? state.snapshot.etag : state.etag).slice(8));
/** A version never moves backwards; at the same version, the tombstone wins. */
const newer = <T>(current: ResourceState<T> | undefined, incoming: ResourceState<T>) =>
	!current ||
	version(incoming) > version(current) ||
	(version(incoming) === version(current) && incoming.kind === 'deleted');

/** Dexie storage with one database per account. A closed account's database never reopens. */
export class IndexedDbWorkspaceReplica<C, T> implements WorkspaceReplicaRepository<C, T> {
	private readonly databases = new Map<string, WorkspaceDatabase>();
	constructor(
		private readonly commandSchema: z.ZodType<C>,
		private readonly valueSchema: z.ZodType<T>,
		private readonly prefix = 'followthrough-workspace-sync'
	) {}

	open(accountId: string): void {
		if (!this.databases.has(accountId))
			this.databases.set(accountId, new WorkspaceDatabase(accountId, this.prefix));
	}
	close(accountId: string): void {
		this.databases.get(accountId)?.stop();
		this.databases.delete(accountId);
	}
	private database(accountId: string): WorkspaceDatabase {
		const database = this.databases.get(accountId);
		if (!database) throw new Error('This account is no longer active');
		return database;
	}

	read(accountId: string): Promise<WorkspaceLocalProjection<C, T>> {
		return this.database(accountId).run(
			'r',
			['records', 'outbox', 'receipts', 'meta'],
			async (tx) => ({
				cache: await this.readCache(tx),
				writes: { entries: await this.readEntries(tx), receipts: await this.readReceipts(tx) }
			})
		);
	}
	observe(
		accountId: string,
		changed: (projection: WorkspaceLocalProjection<C, T>) => void,
		failed: (error: Error) => void
	): () => void {
		const database = this.database(accountId);
		const subscription = liveQuery(() => this.read(accountId)).subscribe({
			next: changed,
			error: (error) =>
				failed(
					error instanceof Error ? error : new Error('Workspace storage could not be observed')
				)
		});
		const stopped = () => {
			subscription.unsubscribe();
			failed(database.lifetime.signal.reason);
		};
		database.lifetime.signal.addEventListener('abort', stopped, { once: true });
		return () => {
			subscription.unsubscribe();
			database.lifetime.signal.removeEventListener('abort', stopped);
		};
	}

	commitCache(accountId: string, commit: CacheCommit<T>): Promise<void> {
		const keys = commit.put.map((row) => row.key);
		if (new Set(keys).size !== keys.length)
			throw new Error('A cache commit must touch each resource only once');
		return this.database(accountId).run('rw', ['records', 'meta'], async (tx) => {
			const stored = await storedTable(tx, 'records').bulkGet(keys);
			await storedTable(tx, 'records').bulkPut(
				commit.put
					.filter((row, index) => newer(this.parseResource(stored[index]), row.entry))
					.map((row) => storedResourceSchema(this.valueSchema).parse(row))
			);
			if (commit.checkpoint) await this.advance(tx, commit.checkpoint);
		});
	}
	private async advance(tx: Transaction, checkpoint: SyncCheckpoint): Promise<void> {
		const raw = await storedTable(tx, 'meta').get('checkpoint');
		const previous = raw === undefined ? null : checkpointSchema.parse(raw);
		if (previous !== null && BigInt(checkpoint.cursor) < BigInt(previous.cursor)) return;
		await storedTable(tx, 'meta').put({
			key: 'checkpoint',
			cursor: checkpoint.cursor,
			inventoryComplete: previous?.inventoryComplete === true || checkpoint.inventoryComplete
		});
	}

	list(accountId: string): Promise<readonly OutboxEntry<C, T>[]> {
		return this.database(accountId).run('r', ['outbox'], (tx) => this.readEntries(tx));
	}
	validate(draft: WriteDraft<C, T>): void {
		outboxEntrySchema(this.commandSchema, this.valueSchema).parse({
			sequence: 1,
			intent: { ...draft, dependencies: [] },
			delivery: { kind: 'queued' }
		});
	}
	transaction<R>(
		accountId: string,
		tables: readonly OutboxTable[],
		work: (tx: OutboxTransaction<C, T>) => Promise<R>
	): Promise<R> {
		return this.database(accountId).run('rw', tables, (tx) =>
			work({
				entries: () => this.readEntries(tx),
				receipt: (key) => this.readReceipt(tx, key),
				resource: async (key) => this.parseResource(await storedTable(tx, 'records').get(key)),
				allocate: async (draft) =>
					z
						.number()
						.int()
						.positive()
						.safe()
						.parse(
							await storedTable(tx, 'outbox').add({
								intent: { ...draft, dependencies: [] },
								delivery: { kind: 'queued' }
							})
						),
				removeAllocated: async (sequence) => {
					await storedTable(tx, 'outbox').delete(sequence);
				},
				replace: async (previous, next) => {
					const store = storedTable(tx, 'outbox');
					const retained = new Set(next.map((entry) => entry.sequence));
					await store.bulkDelete(
						previous.filter((entry) => !retained.has(entry.sequence)).map((entry) => entry.sequence)
					);
					await store.bulkPut(
						next
							.filter((entry) => !previous.includes(entry))
							.map((entry) => outboxEntrySchema(this.commandSchema, this.valueSchema).parse(entry))
					);
				},
				putReceipt: async (key, receipt) => {
					await storedTable(tx, 'receipts').put({
						key,
						receipt: writeReceiptSchema(this.valueSchema).parse(receipt)
					});
				},
				receiveResource: async (key, entry) => {
					const current = this.parseResource(await storedTable(tx, 'records').get(key));
					if (newer(current, entry))
						await storedTable(tx, 'records').put(
							storedResourceSchema(this.valueSchema).parse({ key, entry })
						);
				}
			})
		);
	}

	async exportAccount(accountId: string): Promise<Blob> {
		const database = new Dexie(accountDatabaseName(accountId, this.prefix), { autoOpen: false });
		try {
			await database.open();
			const { exportDB } = await import('dexie-export-import');
			return await exportDB(database);
		} finally {
			database.close({ disableAutoOpen: true });
		}
	}
	async resetAccount(accountId: string): Promise<void> {
		this.close(accountId);
		const database = new Dexie(accountDatabaseName(accountId, this.prefix), { autoOpen: false });
		await new Promise<void>((resolve, reject) => {
			database.on('blocked', () =>
				reject(new Error('Close other app tabs to finish resetting this account, then retry.'))
			);
			void database.delete().then(() => resolve(), reject);
		});
	}

	private parseResource(raw: unknown): ResourceState<T> | undefined {
		return raw === undefined ? undefined : storedResourceSchema(this.valueSchema).parse(raw).entry;
	}
	private async readCache(tx: Transaction): Promise<StoredCache<T>> {
		const records = z
			.array(storedResourceSchema(this.valueSchema))
			.parse(await storedTable(tx, 'records').toArray());
		const raw = await storedTable(tx, 'meta').get('checkpoint');
		const checkpoint = raw === undefined ? null : checkpointSchema.parse(raw);
		return {
			records,
			cursor: checkpoint?.cursor ?? null,
			inventoryComplete: checkpoint?.inventoryComplete ?? false
		};
	}
	private async readEntries(tx: Transaction): Promise<readonly OutboxEntry<C, T>[]> {
		const entries = z
			.array(outboxEntrySchema(this.commandSchema, this.valueSchema))
			.parse(await storedTable(tx, 'outbox').toArray());
		const ids = new Set(entries.map((entry) => entry.intent.operationId));
		if (entries.some((entry) => entry.intent.dependencies.some((id) => !ids.has(id))))
			throw new WorkspaceStorageError('A queued edit lost its dependency');
		return entries;
	}
	private async readReceipt(tx: Transaction, key: string): Promise<WriteReceipt<T> | null> {
		const raw = await storedTable(tx, 'receipts').get(key);
		return raw === undefined
			? null
			: z.object({ key: z.literal(key), receipt: writeReceiptSchema(this.valueSchema) }).parse(raw)
					.receipt;
	}
	private async readReceipts(tx: Transaction): Promise<OutboxProjection<C, T>['receipts']> {
		return new Map(
			z
				.array(z.object({ key: z.string().min(1), receipt: writeReceiptSchema(this.valueSchema) }))
				.parse(await storedTable(tx, 'receipts').toArray())
				.map((row) => [row.key, row.receipt])
		);
	}
}
