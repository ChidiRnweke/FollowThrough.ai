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
import { receiveResource, cachedSnapshot } from '$lib/models/sync';
import { completed, openSyncDatabase, requestValue } from './database';
import type { OutboxRepository } from './outbox-contracts';
import { quarantineRow, recoveryItems, recoverCacheRow } from './storage-recovery';

export class IndexedDbOutbox<C, T> implements OutboxRepository<C, T> {
	private opening: Promise<IDBDatabase> | null = null;
	constructor(
		private readonly commandSchema: z.ZodType<C>,
		private readonly valueSchema: z.ZodType<T>,
		private readonly databaseName = 'followthrough-workspace-sync'
	) {}
	async pendingAcknowledgements(accountId: string): Promise<readonly string[]> {
		const database = await this.open();
		const transaction = database.transaction('acknowledgements', 'readonly');
		const done = completed(transaction);
		const rows = await requestValue(
			transaction.objectStore('acknowledgements').index('accountId').getAll(accountId)
		);
		await done;
		return z
			.array(z.object({ accountId: z.literal(accountId), operationId: z.string().uuid() }))
			.parse(rows)
			.map((row) => row.operationId);
	}
	async acknowledged(accountId: string, operationId: string): Promise<void> {
		const database = await this.open();
		const transaction = database.transaction('acknowledgements', 'readwrite');
		const done = completed(transaction);
		transaction.objectStore('acknowledgements').delete([accountId, operationId]);
		await done;
	}

	async receipt(accountId: string, key: string): Promise<WriteReceipt<T> | null> {
		const database = await this.open();
		const transaction = database.transaction(['write-receipts', 'quarantine'], 'readwrite');
		const done = completed(transaction);
		const [receipt] = await Promise.all([this.appliedReceipt(accountId, key, transaction), done]);
		return receipt;
	}

	async list(accountId: string): Promise<readonly OutboxEntry<C, T>[]> {
		return this.edit(accountId, async (entries) => ({ entries, result: entries }));
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
	): Promise<{ kind: 'imported'; operationId: string } | { kind: 'failure'; message: string }> {
		return this.edit<
			{ kind: 'imported'; operationId: string } | { kind: 'failure'; message: string }
		>(accountId, async (entries, transaction) => {
			const imports = transaction.objectStore('imports');
			const saved = await requestValue(imports.get([accountId, source]));
			if (saved !== undefined) {
				const marker = z
					.object({
						accountId: z.literal(accountId),
						source: z.literal(source),
						operationId: z.string().uuid()
					})
					.safeParse(saved);
				if (!marker.success) {
					const message =
						'The legacy import marker is damaged. Its source was preserved for recovery.';
					quarantineRow(
						transaction,
						{
							accountId,
							source: 'imports',
							key: source,
							message,
							impact: { kind: 'write', operationId: null }
						},
						saved
					);
					return { entries, result: { kind: 'failure', message } };
				}
				return { entries, result: { kind: 'imported', operationId: marker.data.operationId } };
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
				result: { kind: 'imported', operationId: appended.result }
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
		const storedResource = await requestValue(
			transaction.objectStore('records').get([accountId, draft.key])
		);
		const current = (
			await recoverCacheRow(transaction, accountId, draft.key, this.valueSchema, storedResource)
		)?.entry;
		const snapshot = current?.kind === 'present' ? cachedSnapshot(current.cache) : null;
		const observed =
			current?.kind === 'deleted'
				? current
				: snapshot
					? { kind: 'found' as const, snapshot }
					: { kind: 'unavailable' as const };
		const next = appendWrite(entries, draft, sequence, receipt, observed);
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

	take(
		accountId: string,
		excluded: ReadonlySet<string> = new Set()
	): Promise<OutboxEntry<C, T> | null> {
		return this.edit(accountId, async (entries, transaction) => {
			const quarantined = await recoveryItems(transaction, accountId);
			if (
				quarantined.some((item) => item.impact.kind === 'write' && item.impact.operationId === null)
			)
				throw new Error(
					'A saved edit could not be read. Download the recovery copy before resolving workspace writes.'
				);
			const next = nextWrite(entries, excluded);
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
				transaction
					.objectStore('acknowledgements')
					.put({ accountId, operationId: sent.intent.operationId });
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
		if (stored === undefined) return null;
		const parsed = z
			.object({
				accountId: z.literal(accountId),
				key: z.literal(key),
				receipt: writeReceiptSchema(this.valueSchema)
			})
			.safeParse(stored);
		if (parsed.success) return parsed.data.receipt;
		quarantineRow(
			transaction,
			{
				accountId,
				source: 'write-receipts',
				key,
				message: 'A saved acknowledgement was damaged. Dependent edits require version review.',
				impact: { kind: 'cache' }
			},
			stored
		);
		transaction.objectStore('write-receipts').delete([accountId, key]);
		return null;
	}

	private async saveResource(
		accountId: string,
		key: string,
		resource: WriteReceipt<T>['resource'],
		transaction: IDBTransaction
	): Promise<void> {
		const records = transaction.objectStore('records');
		const stored = await requestValue(records.get([accountId, key]));
		const current = await recoverCacheRow(transaction, accountId, key, this.valueSchema, stored);
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
	private async readEntries(
		accountId: string,
		transaction: IDBTransaction
	): Promise<readonly OutboxEntry<C, T>[]> {
		const store = transaction.objectStore('outbox');
		const [rows, keys] = await Promise.all([
			requestValue(store.index('accountId').getAll(accountId)),
			requestValue(store.index('accountId').getAllKeys(accountId))
		]);
		const entries: OutboxEntry<C, T>[] = [];
		for (const [index, row] of rows.entries()) {
			const parsed = this.entriesSchema(accountId).element.safeParse(row);
			if (parsed.success) {
				entries.push(parsed.data.entry);
				continue;
			}
			const identity = z
				.object({ entry: z.object({ intent: z.object({ operationId: z.string().uuid() }) }) })
				.safeParse(row);
			quarantineRow(
				transaction,
				{
					accountId,
					source: 'outbox',
					key: JSON.stringify(keys[index]),
					message: 'This saved edit could not be read. Download its recovery copy.',
					impact: {
						kind: 'write',
						operationId: identity.success ? identity.data.entry.intent.operationId : null
					}
				},
				row
			);
			store.delete(keys[index]);
		}
		const heads = transaction.objectStore('queue-heads');
		const rawHead = await requestValue(heads.get(accountId));
		const head = z
			.object({ accountId: z.literal(accountId), sequence: z.number().int().nonnegative() })
			.safeParse(rawHead);
		const sequences = keys.flatMap((key) => {
			const parsed = z.tuple([z.literal(accountId), z.number().int().positive()]).safeParse(key);
			return parsed.success ? [parsed.data[1]] : [];
		});
		const sequence = sequences.reduce(
			(maximum, sequence) => Math.max(maximum, sequence),
			head.success ? head.data.sequence : 0
		);
		if (!head.success || head.data.sequence !== sequence) {
			if (rawHead !== undefined)
				quarantineRow(
					transaction,
					{
						accountId,
						source: 'queue-heads',
						key: accountId,
						message: 'The queue sequence was repaired from stored edit identities.',
						impact: { kind: 'cache' }
					},
					rawHead
				);
			heads.put({ accountId, sequence });
		}
		return entries;
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
			[
				'outbox',
				'queue-heads',
				'records',
				'imports',
				'write-receipts',
				'acknowledgements',
				'quarantine',
				'cursors',
				'recovery-heads'
			],
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
			const previous = await this.readEntries(accountId, transaction);
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
