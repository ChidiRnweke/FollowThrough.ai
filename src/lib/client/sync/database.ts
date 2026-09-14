import { Dexie, type Table, type Transaction } from 'dexie';
import { z } from 'zod';
import { resourceStateSchema, resourceVersionsConsistent, syncEtagSchema } from '$lib/models/sync';

export const requestValue = <T>(request: IDBRequest<T>): Promise<T> =>
	new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
	});

export const completed = (transaction: IDBTransaction): Promise<void> =>
	new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () =>
			reject(transaction.error ?? new Error('IndexedDB transaction failed'));
		transaction.onabort = () =>
			reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
	});

export const storedResourceSchema = <T>(accountId: string, value: z.ZodType<T>) => {
	const identity = { accountId: z.literal(accountId), key: z.string().min(1) };
	const snapshot = z.object({ etag: syncEtagSchema, value });
	const legacyCache = z
		.discriminatedUnion('kind', [
			z.object({ kind: z.literal('uncached') }),
			z.object({ kind: z.literal('cached'), snapshot }),
			z.object({
				kind: z.literal('updating'),
				previous: snapshot.nullable(),
				target: syncEtagSchema.nullable(),
				transfer: z.discriminatedUnion('kind', [
					z.object({ kind: z.literal('queued') }),
					z.object({ kind: z.literal('fetching') }),
					z.object({ kind: z.literal('failed'), message: z.string() })
				])
			})
		])
		.transform((cache) => {
			const body =
				cache.kind === 'cached'
					? cache.snapshot
					: cache.kind === 'updating'
						? cache.previous
						: null;
			const etag = cache.kind === 'updating' ? (cache.target ?? body?.etag) : body?.etag;
			return etag ? { kind: 'present' as const, etag, body } : { kind: 'requested' as const };
		})
		.refine(
			resourceVersionsConsistent,
			'A retained body cannot be newer than the known resource version'
		);
	return z.union([
		z.object({ ...identity, schemaVersion: z.literal(3), entry: resourceStateSchema(value) }),
		z.object({
			...identity,
			schemaVersion: z.literal(2),
			entry: z.union([
				z
					.object({ kind: z.literal('present'), cache: legacyCache })
					.transform(({ cache }) => cache),
				z.object({ kind: z.literal('deleted'), etag: syncEtagSchema })
			])
		}),
		z.object({ ...identity, schemaVersion: z.literal(1), entry: legacyCache })
	]);
};

/** Native storage upgrades in place; version 2 closes tabs using the old cache shape. */
export class WorkspaceDatabase extends Dexie {
	private upgradeBlocked = false;
	constructor(name = 'followthrough-workspace-sync') {
		super(name);
		this.version(2).stores({
			'recovery-heads': 'accountId',
			quarantine: '[accountId+source+key], accountId',
			records: '[accountId+key], accountId',
			cursors: 'accountId',
			outbox: '[accountId+entry.sequence], accountId, &[accountId+entry.intent.operationId]',
			'write-receipts': '[accountId+key]',
			imports: '[accountId+source]',
			'queue-heads': 'accountId'
		});
		this.on('blocked', () => {
			this.upgradeBlocked = true;
			this.close();
		});
		this.on('versionchange', () => this.close());
	}
	override open(): ReturnType<Dexie['open']> {
		this.upgradeBlocked = false;
		return super.open().catch((error) => {
			if (this.upgradeBlocked)
				throw new Error('Close other app tabs to upgrade workspace storage', { cause: error });
			throw error;
		});
	}
}

/** Weak persisted values are parsed by repository readers before leaving this boundary. */
export const storedTable = (transaction: Transaction, name: string): Table<unknown, IDBValidKey> =>
	transaction.table<unknown, IDBValidKey>(name);
