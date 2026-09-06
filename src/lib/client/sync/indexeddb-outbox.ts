import { z } from 'zod';
import {
	appendWrite,
	beginWrite,
	failWrite,
	nextWrite,
	outboxEntrySchema,
	settleWrite,
	type OutboxEntry,
	type WriteDraft,
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
		return this.edit(accountId, async (entries, transaction) => {
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
			const next = appendWrite(entries, draft, sequence);
			const appended = next.findLast((entry) => entry.intent.key === draft.key);
			if (!appended) throw new Error('The queued resource was not appended');
			heads.put({ accountId, sequence });
			return { entries: next, result: appended.intent.operationId };
		});
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
				const records = transaction.objectStore('records');
				const stored = await requestValue(records.get([accountId, sent.intent.key]));
				const current =
					stored === undefined
						? null
						: storedResourceSchema(accountId, this.valueSchema).parse(stored);
				const resource = outcome.receipt.resource;
				const entry = receiveResource(
					current?.entry ?? { kind: 'present', cache: { kind: 'uncached' } },
					resource.kind === 'found' ? resource.snapshot : resource
				);
				records.put({ schemaVersion: 2, accountId, key: sent.intent.key, entry });
			}
			return { entries: next, result: undefined };
		});
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
		const transaction = database.transaction(['outbox', 'queue-heads', 'records'], 'readwrite');
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
				if (!previous.includes(entry)) store.put({ accountId, entry });
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
