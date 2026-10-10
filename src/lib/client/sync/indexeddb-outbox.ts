import type { Transaction } from 'dexie';
import { z } from 'zod';
import {
	writeReceiptSchema,
	outboxEntrySchema,
	type OutboxEntry,
	type WriteDraft,
	type WriteReceipt
} from '$lib/models/outbox';
import type {
	OutboxStorage,
	OutboxTransaction,
	OutboxTable
} from '$lib/controllers/sync/durable-outbox';
import {
	WorkspaceDatabase,
	WorkspaceStorageError,
	storedResourceSchema,
	storedTable
} from './database';
import type { OutboxProjection } from './outbox-contracts';

/** Queue transitions compose only the stores they change. Observation has no recovery side effects. */
export class IndexedDbOutbox<C, T> implements OutboxStorage<C, T> {
	constructor(
		private readonly commandSchema: z.ZodType<C>,
		private readonly valueSchema: z.ZodType<T>,
		readonly database: WorkspaceDatabase
	) {}
	private async readEntries(tx: Transaction): Promise<readonly OutboxEntry<C, T>[]> {
		const entries = z
			.array(outboxEntrySchema(this.commandSchema, this.valueSchema))
			.parse(await storedTable(tx, 'outbox').toArray());
		const ids = new Set(entries.map((entry) => entry.intent.operationId));
		if (entries.some((entry) => entry.intent.dependencies.some((id) => !ids.has(id))))
			throw new WorkspaceStorageError('A queued edit lost its dependency');
		return entries;
	}
	private async readReceipt(key: string, tx: Transaction): Promise<WriteReceipt<T> | null> {
		const raw = await storedTable(tx, 'receipts').get(key);
		return raw === undefined
			? null
			: z.object({ key: z.literal(key), receipt: writeReceiptSchema(this.valueSchema) }).parse(raw)
					.receipt;
	}
	async receipt(accountId: string, key: string): Promise<WriteReceipt<T> | null> {
		this.database.assertAccount(accountId);
		return this.database.run('r', ['receipts'], (tx) => this.readReceipt(key, tx));
	}
	async snapshot(accountId: string): Promise<OutboxProjection<C, T>> {
		this.database.assertAccount(accountId);
		return this.database.run('r', ['outbox', 'receipts'], (tx) => this.snapshotIn(tx));
	}
	protected async snapshotIn(tx: Transaction): Promise<OutboxProjection<C, T>> {
		return {
			entries: await this.readEntries(tx),
			receipts: new Map(
				z
					.array(
						z.object({ key: z.string().min(1), receipt: writeReceiptSchema(this.valueSchema) })
					)
					.parse(await storedTable(tx, 'receipts').toArray())
					.map((row) => [row.key, row.receipt])
			)
		};
	}
	async list(accountId: string): Promise<readonly OutboxEntry<C, T>[]> {
		this.database.assertAccount(accountId);
		return this.database.run('r', ['outbox'], (tx) => this.readEntries(tx));
	}

	readDraft(draft: WriteDraft<C, T>): WriteDraft<C, T> {
		// Invalid caller input must not mark persisted storage as corrupt or allocate a sequence.
		outboxEntrySchema(this.commandSchema, this.valueSchema).parse({
			sequence: 1,
			intent: { ...draft, dependencies: [] },
			delivery: { kind: 'queued' }
		});
		return draft;
	}
	async transaction<R>(
		accountId: string,
		tables: readonly OutboxTable[],
		work: (tx: OutboxTransaction<C, T>) => Promise<R>
	): Promise<R> {
		this.database.assertAccount(accountId);
		return this.database.run('rw', tables, (tx) =>
			work({
				entries: () => this.readEntries(tx),
				receipt: (key) => this.readReceipt(key, tx),
				resource: async (key) => {
					const raw = await storedTable(tx, 'records').get(key);
					return raw === undefined
						? undefined
						: storedResourceSchema(this.valueSchema).parse(raw).entry;
				},
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
				putResource: async (key, entry) => {
					await storedTable(tx, 'records').put(
						storedResourceSchema(this.valueSchema).parse({ key, entry })
					);
				}
			})
		);
	}
	async close(): Promise<void> {
		this.database.close();
	}
}
