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
	type WriteObservation,
	type OutboxEntry,
	type WriteDraft,
	type WriteReceipt,
	type WriteOutcome
} from '$lib/models/outbox';
import { receiveResource } from '$lib/models/sync';
import { completed, openSyncDatabase, requestValue, storedResourceSchema } from './database';
import type { OutboxRepository } from './outbox-contracts';

export class IndexedDbOutbox<C, T> implements OutboxRepository<C, T> {
	private opening: Promise<IDBDatabase> | null = null;
	constructor(
		private readonly commandSchema: z.ZodType<C>,
		private readonly valueSchema: z.ZodType<T>,
		private readonly databaseName = 'followthrough-workspace-sync'
	) {}

	async receipt(accountId: string, key: string): Promise<WriteReceipt<T> | null> {
		const database = await this.open();
		const transaction = database.transaction('write-receipts', 'readonly');
		const done = completed(transaction);
		const [receipt] = await Promise.all([this.appliedReceipt(accountId, key, transaction), done]);
		return receipt;
	}

	async list(accountId: string): Promise<readonly OutboxEntry<C, T>[]> {
		const database = await this.open();
		const transaction = database.transaction('outbox', 'readonly');
		const done = completed(transaction);
		const [rows] = await Promise.all([
			requestValue(transaction.objectStore('outbox').index('accountId').getAll(accountId)),
			done
		]);
		return this.entriesSchema(accountId)
			.parse(rows)
			.map((row) => row.entry);
	}

	append(accountId: string, draft: WriteDraft<C, T>): Promise<string> {
		return this.edit(accountId, (entries, transaction) =>
			this.appendEntry(accountId, draft, entries, transaction)
		);
	}

	/** The source marker and imported intent commit together; an interrupted upgrade can safely retry. */
	importOnce(
		accountId: string,
		source: string,
		draft: WriteDraft<C, T>,
		conflict: WriteObservation<T> | null
	): Promise<string> {
		return this.edit(accountId, async (entries, transaction) => {
			const imports = transaction.objectStore('imports');
			const saved = await requestValue(imports.get([accountId, source]));
			if (saved !== undefined) {
				const marker = z
					.object({
						accountId: z.literal(accountId),
						source: z.literal(source),
						operationId: z.string().uuid()
					})
					.parse(saved);
				return { entries, result: marker.operationId };
			}
			const appended = await this.appendEntry(accountId, draft, entries, transaction);
			imports.put({ accountId, source, operationId: appended.result });
			return {
				entries: conflict
					? appended.entries.map((entry) =>
							entry.intent.operationId === appended.result
								? { ...entry, delivery: { kind: 'conflict' as const, remote: conflict } }
								: entry
						)
					: appended.entries,
				result: appended.result
			};
		});
	}

	private async appendEntry(
		accountId: string,
		draft: WriteDraft<C, T>,
		entries: readonly OutboxEntry<C, T>[],
		transaction: IDBTransaction
	): Promise<{ entries: readonly OutboxEntry<C, T>[]; result: string }> {
		const heads = transaction.objectStore('queue-heads');
		const stored = await requestValue(heads.get(accountId));
		if (stored === undefined && entries.length)
			throw new Error('The local queue has lost its sequence head');
		const previous =
			stored === undefined
				? 0
				: z
						.object({ accountId: z.literal(accountId), sequence: z.number().int().nonnegative() })
						.parse(stored).sequence;
		if (entries.some((entry) => entry.sequence > previous))
			throw new Error('The local queue sequence head precedes its writes');
		const sequence = previous + 1;
		if (!Number.isSafeInteger(sequence)) throw new Error('The local queue sequence is exhausted');
		const receipt = await this.appliedReceipt(accountId, draft.key, transaction);
		const next = appendWrite(entries, draft, sequence, receipt);
		const appended = next.findLast((entry) => entry.intent.key === draft.key);
		if (!appended) throw new Error('The queued resource was not appended');
		heads.put({ accountId, sequence });
		return { entries: next, result: appended.intent.operationId };
	}

	resolveBase(
		accountId: string,
		operationId: string,
		resolution: WriteBaseResolution<T>
	): Promise<void> {
		return this.edit(accountId, async (entries, transaction) => {
			const original = entries.find((entry) => entry.intent.operationId === operationId);
			const resource =
				resolution.kind === 'matched'
					? { kind: 'found' as const, snapshot: resolution.snapshot }
					: resolution.remote;
			if (original && resource.kind !== 'unavailable')
				await this.saveResource(accountId, original.intent.key, resource, transaction);
			return { entries: resolveWriteBase(entries, operationId, resolution), result: undefined };
		});
	}

	keepLocal(accountId: string, operationId: string, replacementId: string): Promise<void> {
		return this.edit(accountId, async (entries) => ({
			entries: retryConflictedWrite(entries, operationId, replacementId),
			result: undefined
		}));
	}
	discard(accountId: string, operationIds: readonly string[]): Promise<void> {
		return this.edit(accountId, async (entries) => ({
			entries: discardWrites(entries, operationIds),
			result: undefined
		}));
	}

	take(accountId: string): Promise<OutboxEntry<C, T> | null> {
		return this.edit(accountId, async (entries) => {
			const next = nextWrite(entries);
			if (!next) return { entries, result: null };
			const sent = beginWrite(next);
			return { entries: entries.map((entry) => (entry === next ? sent : entry)), result: sent };
		});
	}

	retry(accountId: string, operationId: string, message: string): Promise<void> {
		return this.edit(accountId, async (entries) => ({
			entries: entries.map((entry) =>
				entry.intent.operationId === operationId ? failWrite(entry, message) : entry
			),
			result: undefined
		}));
	}

	recover(accountId: string): Promise<void> {
		return this.edit(accountId, async (entries) => ({
			entries: entries.map((entry) =>
				failWrite(entry, 'Interrupted submission; checking its receipt')
			),
			result: undefined
		}));
	}

	settle(accountId: string, sent: OutboxEntry<C, T>, outcome: WriteOutcome<T>): Promise<void> {
		return this.edit(accountId, async (entries, transaction) => {
			const next = settleWrite(entries, sent.intent.operationId, outcome);
			if (outcome.kind === 'applied') {
				const previous = await this.appliedReceipt(accountId, sent.intent.key, transaction);
				const receipt = retainWriteReceipt(
					previous,
					writeReceiptSchema(this.valueSchema).parse(outcome.receipt)
				);
				transaction.objectStore('write-receipts').put({ accountId, key: sent.intent.key, receipt });
			}
			const resource = authoritativeWriteResource(outcome);
			if (resource) await this.saveResource(accountId, sent.intent.key, resource, transaction);
			return { entries: next, result: undefined };
		});
	}

	private async appliedReceipt(
		accountId: string,
		key: string,
		transaction: IDBTransaction
	): Promise<WriteReceipt<T> | null> {
		const stored = await requestValue(
			transaction.objectStore('write-receipts').get([accountId, key])
		);
		return stored === undefined
			? null
			: z
					.object({
						accountId: z.literal(accountId),
						key: z.literal(key),
						receipt: writeReceiptSchema(this.valueSchema)
					})
					.parse(stored).receipt;
	}

	private async saveResource(
		accountId: string,
		key: string,
		resource: WriteReceipt<T>['resource'],
		transaction: IDBTransaction
	): Promise<void> {
		const records = transaction.objectStore('records');
		const stored = await requestValue(records.get([accountId, key]));
		const current =
			stored === undefined ? null : storedResourceSchema(accountId, this.valueSchema).parse(stored);
		const entry = receiveResource(
			current?.entry ?? { kind: 'present', cache: { kind: 'uncached' } },
			resource.kind === 'found' ? resource.snapshot : resource
		);
		records.put({ schemaVersion: 2, accountId, key: key, entry });
	}

	private entriesSchema(accountId: string) {
		return z.array(
			z.object({
				accountId: z.literal(accountId),
				entry: outboxEntrySchema(this.commandSchema, this.valueSchema)
			})
		);
	}

	private async edit<R>(
		accountId: string,
		work: (
			entries: readonly OutboxEntry<C, T>[],
			transaction: IDBTransaction
		) => Promise<{ entries: readonly OutboxEntry<C, T>[]; result: R }>
	): Promise<R> {
		const database = await this.open();
		const transaction = database.transaction(
			['outbox', 'queue-heads', 'records', 'imports', 'write-receipts'],
			'readwrite'
		);
		const done = completed(transaction);
		let active = true;
		transaction.addEventListener('abort', () => {
			active = false;
		});
		transaction.addEventListener('complete', () => {
			active = false;
		});
		try {
			const store = transaction.objectStore('outbox');
			const rows = await requestValue(store.index('accountId').getAll(accountId));
			const previous = this.entriesSchema(accountId)
				.parse(rows)
				.map((row) => row.entry);
			const change = await work(previous, transaction);
			const retained = new Set(change.entries.map((entry) => entry.sequence));
			for (const entry of previous)
				if (!retained.has(entry.sequence)) store.delete([accountId, entry.sequence]);
			for (const entry of change.entries)
				if (!previous.includes(entry))
					store.put({
						accountId,
						entry: outboxEntrySchema(this.commandSchema, this.valueSchema).parse(entry)
					});
			await done;
			return change.result;
		} catch (error) {
			if (active) transaction.abort();
			await done.catch(() => {
				return { kind: 'failure' };
			});
			throw error;
		}
	}

	async close(): Promise<void> {
		if (!this.opening) return;
		(await this.opening).close();
		this.opening = null;
	}
	private open(): Promise<IDBDatabase> {
		this.opening ??= openSyncDatabase(this.databaseName, () => {
			this.opening = null;
		}).catch((error) => {
			this.opening = null;
			throw error;
		});
		return this.opening;
	}
}
