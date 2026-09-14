import type { Transaction } from 'dexie';
import { z } from 'zod';
import {
	authoritativeWriteResource,
	rejectUnprovenAncestry,
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
import { receiveResource, cachedSnapshot, recoveryBlocksWrite } from '$lib/models/sync';
import { WorkspaceDatabase, storedTable } from './database';
import type { OutboxRepository, OutboxProjection } from './outbox-contracts';
import { quarantineRow, recoveryItems, recoverCacheRow } from './storage-recovery';

export class IndexedDbOutbox<C, T> implements OutboxRepository<C, T> {
	constructor(
		private readonly commandSchema: z.ZodType<C>,
		private readonly valueSchema: z.ZodType<T>,
		databaseName = 'followthrough-workspace-sync',
		readonly database = new WorkspaceDatabase(databaseName)
	) {}
	receipt(accountId: string, key: string): Promise<WriteReceipt<T> | null> {
		return this.database.transaction('rw', ['write-receipts', 'quarantine'], (transaction) =>
			this.appliedReceipt(accountId, key, transaction)
		);
	}
	async receipts(accountId: string): Promise<ReadonlyMap<string, WriteReceipt<T>>> {
		return this.database.transaction(
			'rw',
			['write-receipts', 'quarantine'],
			async (transaction) => {
				const keys = await storedTable(transaction, 'write-receipts')
					.where('[accountId+key]')
					.between([accountId, ''], [accountId, []])
					.primaryKeys();
				const receipts = new Map<string, WriteReceipt<T>>();
				for (const raw of keys) {
					const [, key] = z.tuple([z.literal(accountId), z.string()]).parse(raw);
					const receipt = await this.appliedReceipt(accountId, key, transaction);
					if (receipt) receipts.set(key, receipt);
				}
				return receipts;
			}
		);
	}

	snapshot(accountId: string): Promise<OutboxProjection<C, T>> {
		return this.database.transaction('rw', this.database.tables, async () => ({
			entries: await this.list(accountId),
			receipts: await this.receipts(accountId)
		}));
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
			const imports = storedTable(transaction, 'imports');
			const saved = await imports.get([accountId, source]);
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
					await quarantineRow(
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
		transaction: Transaction
	): Promise<{ entries: readonly OutboxEntry<C, T>[]; result: string }> {
		const heads = storedTable(transaction, 'queue-heads');
		const stored = await heads.get(accountId);
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
		const storedResource = await storedTable(transaction, 'records').get([accountId, draft.key]);
		const current = (
			await recoverCacheRow(transaction, accountId, draft.key, this.valueSchema, storedResource)
		)?.entry;
		const snapshot = current?.kind === 'present' ? cachedSnapshot(current) : null;
		const observed =
			current?.kind === 'deleted'
				? current
				: snapshot
					? { kind: 'found' as const, snapshot }
					: { kind: 'unavailable' as const };
		const next = appendWrite(entries, draft, sequence, receipt, observed);
		const appended = next.findLast((entry) => entry.intent.key === draft.key);
		if (!appended) throw new Error('The queued resource was not appended');
		await heads.put({ accountId, sequence });
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
			const blocked = new Set(excluded);
			for (const entry of entries)
				if (quarantined.some((item) => recoveryBlocksWrite(item.impact, entry.intent.key)))
					blocked.add(entry.intent.operationId);
			const next = nextWrite(entries, blocked);
			if (!next && nextWrite(entries, excluded))
				throw new Error(
					'Saved data needs review before these changes can sync. Download its recovery copy.'
				);

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
				await storedTable(transaction, 'write-receipts').put({
					accountId,
					key: sent.intent.key,
					receipt
				});
			}
			const resource = authoritativeWriteResource(outcome);
			if (resource) await this.saveResource(accountId, sent.intent.key, resource, transaction);
			return { entries: next, result: undefined };
		});
	}

	private async appliedReceipt(
		accountId: string,
		key: string,
		transaction: Transaction
	): Promise<WriteReceipt<T> | null> {
		const stored = await storedTable(transaction, 'write-receipts').get([accountId, key]);
		if (stored === undefined) return null;
		const parsed = z
			.object({
				accountId: z.literal(accountId),
				key: z.literal(key),
				receipt: writeReceiptSchema(this.valueSchema)
			})
			.safeParse(stored);
		if (parsed.success) return parsed.data.receipt;
		await quarantineRow(
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
		await storedTable(transaction, 'write-receipts').delete([accountId, key]);
		return null;
	}

	private async saveResource(
		accountId: string,
		key: string,
		resource: WriteReceipt<T>['resource'],
		transaction: Transaction
	): Promise<void> {
		const records = storedTable(transaction, 'records');
		const stored = await records.get([accountId, key]);
		const current = await recoverCacheRow(transaction, accountId, key, this.valueSchema, stored);
		const entry = receiveResource(
			current?.entry,
			resource.kind === 'found' ? resource.snapshot : resource
		);
		await records.put({ schemaVersion: 3, accountId, key: key, entry });
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
		transaction: Transaction
	): Promise<readonly OutboxEntry<C, T>[]> {
		const store = storedTable(transaction, 'outbox');
		const [rows, keys] = await Promise.all([
			store.where('accountId').equals(accountId).toArray(),
			store.where('accountId').equals(accountId).primaryKeys()
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
			const resource = z
				.object({ entry: z.object({ intent: z.object({ key: z.string().min(1) }) }) })
				.safeParse(row);
			await quarantineRow(
				transaction,
				{
					accountId,
					source: 'outbox',
					key: JSON.stringify(keys[index]),
					message: 'This saved edit could not be read. Download its recovery copy.',
					impact: {
						...(resource.success
							? { kind: 'resource' as const, key: resource.data.entry.intent.key }
							: { kind: 'write' as const }),
						operationId: identity.success ? identity.data.entry.intent.operationId : null
					}
				},
				row
			);
			await store.delete(keys[index]);
		}
		const heads = storedTable(transaction, 'queue-heads');
		const rawHead = await heads.get(accountId);
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
				await quarantineRow(
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
			await heads.put({ accountId, sequence });
		}

		const recovered = rejectUnprovenAncestry(entries);
		for (const entry of recovered)
			if (!entries.includes(entry)) await store.put({ accountId, entry });
		return recovered;
	}

	private async edit<R>(
		accountId: string,
		work: (
			entries: readonly OutboxEntry<C, T>[],
			transaction: Transaction
		) => Promise<{ entries: readonly OutboxEntry<C, T>[]; result: R }>
	): Promise<R> {
		return this.database.transaction(
			'rw',
			[
				'outbox',
				'queue-heads',
				'records',
				'imports',
				'write-receipts',
				'quarantine',
				'cursors',
				'recovery-heads'
			],
			async (transaction) => {
				const store = storedTable(transaction, 'outbox');
				const previous = await this.readEntries(accountId, transaction);
				const change = await work(previous, transaction);
				const retained = new Set(change.entries.map((entry) => entry.sequence));
				for (const entry of previous)
					if (!retained.has(entry.sequence)) await store.delete([accountId, entry.sequence]);
				for (const entry of change.entries)
					if (!previous.includes(entry))
						await store.put({
							accountId,
							entry: outboxEntrySchema(this.commandSchema, this.valueSchema).parse(entry)
						});
				return change.result;
			}
		);
	}

	async close(): Promise<void> {
		this.database.close();
	}
}
