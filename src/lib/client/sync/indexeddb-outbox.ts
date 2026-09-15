import type { Transaction } from 'dexie';
import { z } from 'zod';
import {
	authoritativeWriteResource,
	writeReceiptSchema,
	retainWriteReceipt,
	retryConflictedWrite,
	discardWrites,
	appendWrite,
	beginWrite,
	failWrite,
	nextWrite,
	outboxEntrySchema,
	settleWrite,
	resolveWriteBase,
	type WriteBaseResolution,
	type OutboxEntry,
	type WriteDraft,
	type WriteReceipt,
	type WriteOutcome
} from '$lib/models/outbox';
import { receiveResource, cachedSnapshot } from '$lib/models/sync';
import {
	WorkspaceDatabase,
	WorkspaceStorageError,
	storedResourceSchema,
	storedTable
} from './database';
import type { OutboxRepository, OutboxProjection } from './outbox-contracts';

/** Queue transitions compose only the stores they change. Observation has no recovery side effects. */
export class IndexedDbOutbox<C, T> implements OutboxRepository<C, T> {
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
	async append(accountId: string, draft: WriteDraft<C, T>): Promise<string> {
		outboxEntrySchema(this.commandSchema, this.valueSchema).parse({
			sequence: 1,
			intent: { ...draft, dependencies: [] },
			delivery: { kind: 'queued' }
		});
		return this.change(accountId, ['outbox', 'records', 'receipts'], async (entries, tx) => {
			const receipt = await this.readReceipt(draft.key, tx);
			const raw = await storedTable(tx, 'records').get(draft.key);
			const current =
				raw === undefined ? undefined : storedResourceSchema(this.valueSchema).parse(raw).entry;
			const snapshot = cachedSnapshot(current);
			const observed =
				current?.kind === 'deleted'
					? current
					: snapshot
						? { kind: 'found' as const, snapshot }
						: { kind: 'unavailable' as const };
			// IndexedDB allocates order in the same transaction as the final intent. An abort also rolls back allocation.
			const sequence = z
				.number()
				.int()
				.positive()
				.safe()
				.parse(
					await storedTable(tx, 'outbox').add({
						intent: { ...draft, dependencies: [] },
						delivery: { kind: 'queued' }
					})
				);
			const next = appendWrite(entries, draft, sequence, receipt, observed);
			const appended = next.find((entry) => entry.intent.operationId === draft.operationId);
			if (!appended) throw new Error('The queued resource was not appended');
			if (appended.sequence !== sequence) await storedTable(tx, 'outbox').delete(sequence);
			return { entries: next, result: appended.intent.operationId };
		});
	}
	async resolveBase(
		accountId: string,
		operationId: string,
		resolution: WriteBaseResolution<T>
	): Promise<void> {
		return this.change(accountId, ['outbox', 'records'], async (entries, tx) => {
			const original = entries.find((entry) => entry.intent.operationId === operationId);
			if (original && resolution.remote.kind !== 'unavailable')
				await this.saveResource(original.intent.key, resolution.remote, tx);
			return { entries: resolveWriteBase(entries, operationId, resolution), result: undefined };
		});
	}
	async keepLocal(accountId: string, operationId: string, replacementId: string): Promise<void> {
		return this.change(accountId, ['outbox'], async (entries) => ({
			entries: retryConflictedWrite(entries, operationId, replacementId),
			result: undefined
		}));
	}
	async discard(accountId: string, operationIds: readonly string[]): Promise<void> {
		return this.change(accountId, ['outbox'], async (entries) => ({
			entries: discardWrites(entries, operationIds),
			result: undefined
		}));
	}
	async take(
		accountId: string,
		excluded: ReadonlySet<string> = new Set()
	): Promise<OutboxEntry<C, T> | null> {
		return this.change(accountId, ['outbox'], async (entries) => {
			const next = nextWrite(entries, excluded);
			if (!next) return { entries, result: null };
			const sent = beginWrite(next);
			return { entries: entries.map((entry) => (entry === next ? sent : entry)), result: sent };
		});
	}
	async retry(accountId: string, operationId: string, message: string): Promise<void> {
		return this.change(accountId, ['outbox'], async (entries) => ({
			entries: entries.map((entry) =>
				entry.intent.operationId === operationId ? failWrite(entry, message) : entry
			),
			result: undefined
		}));
	}
	async recover(accountId: string): Promise<void> {
		return this.change(accountId, ['outbox'], async (entries) => ({
			entries: entries.map((entry) =>
				failWrite(entry, 'Interrupted submission; checking its operation proof')
			),
			result: undefined
		}));
	}
	async settle(
		accountId: string,
		sent: OutboxEntry<C, T>,
		outcome: WriteOutcome<T>
	): Promise<void> {
		return this.change(accountId, ['outbox', 'records', 'receipts'], async (entries, tx) => {
			const next = settleWrite(entries, sent.intent.operationId, outcome);
			if (outcome.kind === 'applied') {
				const previous = await this.readReceipt(sent.intent.key, tx);
				const receipt = retainWriteReceipt(
					previous,
					writeReceiptSchema(this.valueSchema).parse(outcome.receipt)
				);
				await storedTable(tx, 'receipts').put({ key: sent.intent.key, receipt });
			}
			const resource = authoritativeWriteResource(outcome);
			if (resource) await this.saveResource(sent.intent.key, resource, tx);
			return { entries: next, result: undefined };
		});
	}
	private async saveResource(
		key: string,
		resource: WriteReceipt<T>['resource'],
		tx: Transaction
	): Promise<void> {
		const records = storedTable(tx, 'records');
		const raw = await records.get(key);
		const current =
			raw === undefined ? undefined : storedResourceSchema(this.valueSchema).parse(raw).entry;
		await records.put({
			key,
			entry: receiveResource(current, resource.kind === 'found' ? resource.snapshot : resource)
		});
	}
	private async change<R>(
		accountId: string,
		tables: readonly string[],
		work: (
			entries: readonly OutboxEntry<C, T>[],
			tx: Transaction
		) => Promise<{ entries: readonly OutboxEntry<C, T>[]; result: R }>
	): Promise<R> {
		this.database.assertAccount(accountId);
		return this.database.run('rw', tables, async (tx) => {
			const previous = await this.readEntries(tx);
			const change = await work(previous, tx);
			const store = storedTable(tx, 'outbox');
			const retained = new Set(change.entries.map((entry) => entry.sequence));
			await store.bulkDelete(
				previous.filter((entry) => !retained.has(entry.sequence)).map((entry) => entry.sequence)
			);
			await store.bulkPut(
				change.entries
					.filter((entry) => !previous.includes(entry))
					.map((entry) => outboxEntrySchema(this.commandSchema, this.valueSchema).parse(entry))
			);
			return change.result;
		});
	}
	async close(): Promise<void> {
		this.database.close();
	}
}
