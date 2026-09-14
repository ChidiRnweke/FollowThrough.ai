import { z } from 'zod';
import { syncCursorSchema, mergeResourceStates, resourceVersion } from '$lib/models/sync';
import type { CacheCommit, StoredCache, SyncCacheRepository } from './contracts';

import { WorkspaceDatabase, storedTable } from './database';
import {
	recoverCacheRow,
	recoveryGeneration,
	invalidateInventory,
	quarantineRow
} from './storage-recovery';

/** Parses persisted data here; the resource cache never handles weak storage values. */
export class IndexedDbSyncCache<T> implements SyncCacheRepository<T> {
	constructor(
		private readonly valueSchema: z.ZodType<T>,
		databaseName = 'followthrough-workspace-sync',
		readonly database = new WorkspaceDatabase(databaseName)
	) {}

	async load(accountId: string): Promise<StoredCache<T>> {
		return this.database.transaction(
			'rw',
			['records', 'cursors', 'quarantine', 'recovery-heads'],
			async (transaction) => {
				const [rows, keys] = await Promise.all([
					storedTable(transaction, 'records').where('accountId').equals(accountId).toArray(),
					storedTable(transaction, 'records').where('accountId').equals(accountId).primaryKeys()
				]);
				await recoveryGeneration(transaction, accountId);
				const records: StoredCache<T>['records'][number][] = [];
				for (const [index, row] of rows.entries()) {
					const identity = z
						.tuple([z.literal(accountId), z.string().min(1)])
						.safeParse(keys[index]);
					if (!identity.success) {
						await quarantineRow(
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
						await storedTable(transaction, 'records').delete(keys[index]);
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
				const rawCursor = await storedTable(transaction, 'cursors').get(accountId);
				const parsedCursor = z
					.object({
						accountId: z.literal(accountId),
						cursor: syncCursorSchema,
						inventoryComplete: z.boolean().default(true)
					})
					.safeParse(rawCursor);
				if (rawCursor !== undefined && !parsedCursor.success) {
					await quarantineRow(
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
				return {
					records,
					cursor: parsedCursor.success ? parsedCursor.data.cursor : null,
					inventoryComplete: parsedCursor.success && parsedCursor.data.inventoryComplete,
					generation
				};
			}
		);
	}

	async commit(accountId: string, changes: CacheCommit<T>): Promise<void> {
		const committed = await this.database.transaction(
			'rw',
			['records', 'cursors', 'quarantine', 'recovery-heads'],
			async (transaction) => {
				let recovered: boolean;
				const generation = await recoveryGeneration(transaction, accountId);
				if (changes.generation !== undefined && changes.generation !== generation)
					throw new Error('Workspace storage was recovered in another tab. Retry synchronization.');
				const records = storedTable(transaction, 'records');
				const keys = [
					...changes.put.map((record) => record.key),
					...changes.remove.map((record) => record.key)
				];
				if (new Set(keys).size !== keys.length)
					throw new Error('A cache commit must touch each resource only once');
				const [rows, cursor] = await Promise.all([
					Promise.all(keys.map((key) => records.get([accountId, key]))),
					storedTable(transaction, 'cursors').get(accountId)
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
					await records.put({ schemaVersion: 3, accountId, ...record });
				}
				for (const removal of changes.remove) {
					const previous = current.get(removal.key);
					if (!previous || resourceVersion(previous.entry) === removal.etag) {
						await records.delete([accountId, removal.key]);
					}
				}
				const parsed = z
					.object({
						accountId: z.literal(accountId),
						cursor: syncCursorSchema,
						inventoryComplete: z.boolean().default(true)
					})
					.safeParse(cursor);
				if (cursor !== undefined && !parsed.success) {
					await quarantineRow(
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
					await storedTable(transaction, 'cursors').put({
						accountId,
						cursor: changes.cursor,
						inventoryComplete:
							(parsed.success && parsed.data.inventoryComplete) ||
							(changes.inventoryComplete ?? true)
					});
				return { recovered };
			}
		);
		if (committed.recovered)
			throw new Error(
				'Damaged workspace storage was recovered. Retry synchronization to rebuild its inventory.'
			);
	}

	async close(): Promise<void> {
		this.database.close();
	}
}
