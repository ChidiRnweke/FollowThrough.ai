import { z } from 'zod';
import { syncCursorSchema, mergeResourceStates, resourceVersion } from '$lib/models/sync';
import type { CacheCommit, StoredCache, SyncCacheRepository } from './contracts';

import { requestValue, completed, openSyncDatabase } from './database';
import {
	recoverCacheRow,
	recoveryGeneration,
	invalidateInventory,
	quarantineRow
} from './storage-recovery';

/** Parses persisted data here; the resource cache never handles weak storage values. */
export class IndexedDbSyncCache<T> implements SyncCacheRepository<T> {
	private opening: Promise<IDBDatabase> | null = null;

	constructor(
		private readonly valueSchema: z.ZodType<T>,
		private readonly databaseName = 'followthrough-workspace-sync'
	) {}

	async load(accountId: string): Promise<StoredCache<T>> {
		const database = await this.open();
		const transaction = database.transaction(
			['records', 'cursors', 'quarantine', 'recovery-heads'],
			'readwrite'
		);
		const done = completed(transaction);
		const [rows, keys] = await Promise.all([
			requestValue(transaction.objectStore('records').index('accountId').getAll(accountId)),
			requestValue(transaction.objectStore('records').index('accountId').getAllKeys(accountId))
		]);
		try {
			const records: StoredCache<T>['records'][number][] = [];
			for (const [index, row] of rows.entries()) {
				const identity = z.tuple([z.literal(accountId), z.string().min(1)]).safeParse(keys[index]);
				if (!identity.success) {
					quarantineRow(
						transaction,
						{
							accountId,
							source: 'records',
							key: JSON.stringify(keys[index]),
							message:
								'A cached identity was unreadable; the workspace inventory will be downloaded again.',
							impact: { kind: 'cache' }
						},
						row
					);
					transaction.objectStore('records').delete(keys[index]);
					await invalidateInventory(transaction, accountId);
					continue;
				}
				const record = await recoverCacheRow(
					transaction,
					accountId,
					identity.data[1],
					this.valueSchema,
					row
				);
				if (record) records.push({ key: record.key, entry: record.entry });
			}
			const rawCursor = await requestValue(transaction.objectStore('cursors').get(accountId));
			const parsedCursor = z
				.object({
					accountId: z.literal(accountId),
					cursor: syncCursorSchema,
					inventoryComplete: z.boolean().default(true)
				})
				.safeParse(rawCursor);
			if (rawCursor !== undefined && !parsedCursor.success) {
				quarantineRow(
					transaction,
					{
						accountId,
						source: 'cursors',
						key: accountId,
						message: 'The workspace inventory checkpoint was damaged and will be rebuilt.',
						impact: { kind: 'cache' }
					},
					rawCursor
				);
				await invalidateInventory(transaction, accountId);
			}
			const generation = await recoveryGeneration(transaction, accountId);
			await done;
			return {
				records,
				cursor: parsedCursor.success ? parsedCursor.data.cursor : null,
				inventoryComplete: parsedCursor.success && parsedCursor.data.inventoryComplete,
				generation
			};
		} catch (error) {
			transaction.abort();
			await done.catch(() => {
				return { kind: 'failure' };
			});
			throw error;
		}
	}

	async commit(accountId: string, changes: CacheCommit<T>): Promise<CacheCommit<T>> {
		const database = await this.open();
		const transaction = database.transaction(
			['records', 'cursors', 'quarantine', 'recovery-heads'],
			'readwrite'
		);
		const done = completed(transaction);
		const put: CacheCommit<T>['put'][number][] = [];
		const remove: CacheCommit<T>['remove'][number][] = [];
		let recovered: boolean;
		try {
			const generation = await recoveryGeneration(transaction, accountId);
			if (changes.generation !== undefined && changes.generation !== generation)
				throw new Error('Workspace storage was recovered in another tab. Retry synchronization.');
			const records = transaction.objectStore('records');
			const keys = [
				...changes.put.map((record) => record.key),
				...changes.remove.map((record) => record.key)
			];
			if (new Set(keys).size !== keys.length)
				throw new Error('A cache commit must touch each resource only once');
			const [rows, cursor] = await Promise.all([
				Promise.all(keys.map((key) => requestValue(records.get([accountId, key])))),
				requestValue(transaction.objectStore('cursors').get(accountId))
			]);
			const current = new Map<string, Awaited<ReturnType<typeof recoverCacheRow<T>>>>();
			for (const [index, key] of keys.entries())
				current.set(
					key,
					await recoverCacheRow(transaction, accountId, key, this.valueSchema, rows[index])
				);
			recovered = generation !== (await recoveryGeneration(transaction, accountId));
			for (const proposed of changes.put) {
				const previous = current.get(proposed.key);
				const record = {
					key: proposed.key,
					entry: previous ? mergeResourceStates(previous.entry, proposed.entry) : proposed.entry
				};
				records.put({ schemaVersion: 2, accountId, ...record });
				put.push(record);
			}
			for (const removal of changes.remove) {
				const previous = current.get(removal.key);
				if (!previous || resourceVersion(previous.entry) === removal.etag) {
					records.delete([accountId, removal.key]);
					remove.push(removal);
				} else put.push({ key: removal.key, entry: previous.entry });
			}
			const parsed = z
				.object({
					accountId: z.literal(accountId),
					cursor: syncCursorSchema,
					inventoryComplete: z.boolean().default(true)
				})
				.safeParse(cursor);
			if (cursor !== undefined && !parsed.success) {
				quarantineRow(
					transaction,
					{
						accountId,
						source: 'cursors',
						key: accountId,
						message: 'The workspace inventory checkpoint was damaged and will be rebuilt.',
						impact: { kind: 'cache' }
					},
					cursor
				);
				await invalidateInventory(transaction, accountId);
				recovered = true;
			}
			const storedCursor = parsed.success ? parsed.data.cursor : null;
			if (
				!recovered &&
				changes.cursor !== undefined &&
				(storedCursor === null || BigInt(changes.cursor) >= BigInt(storedCursor))
			)
				transaction.objectStore('cursors').put({
					accountId,
					cursor: changes.cursor,
					inventoryComplete:
						(parsed.success && parsed.data.inventoryComplete) || (changes.inventoryComplete ?? true)
				});
		} catch (error) {
			transaction.abort();
			await done.catch(() => {
				return { kind: 'failure' };
			});
			throw error;
		}
		await done;
		if (recovered)
			throw new Error(
				'Damaged workspace storage was recovered. Retry synchronization to rebuild its inventory.'
			);
		return { ...changes, put, remove };
	}

	async close(): Promise<void> {
		if (!this.opening) return;
		const database = await this.opening;
		database.close();
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
