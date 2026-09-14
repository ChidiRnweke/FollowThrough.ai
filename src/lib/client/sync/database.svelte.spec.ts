import { afterEach, describe, expect, it } from 'vitest';
import { appendWrite } from '$lib/models/outbox';
import { syncEtag } from '$lib/models/sync';
import { WorkspaceDatabase, requestValue, completed } from './database';

const connections: { close(): void }[] = [];
const names = new Set<string>();
const nameForTest = () => {
	const name = `workspace-storage-${crypto.randomUUID()}`;
	names.add(name);
	return name;
};
const open = async (name = nameForTest()) => {
	const database = new WorkspaceDatabase(name);
	connections.push(database);
	await database.open();
	return database;
};

/** Reproduce the previous native version's real keys and indexes before opening Dexie. */
const openNativeVersionSix = async (name: string) => {
	const request = indexedDB.open(name, 6);
	request.onupgradeneeded = () => {
		const database = request.result;
		for (const store of ['recovery-heads', 'cursors', 'queue-heads'])
			database.createObjectStore(store, { keyPath: 'accountId' });
		for (const [store, keyPath] of [
			['records', ['accountId', 'key']],
			['acknowledgements', ['accountId', 'operationId']],
			['quarantine', ['accountId', 'source', 'key']],
			['outbox', ['accountId', 'entry.sequence']]
		] satisfies [string, string[]][]) {
			const table = database.createObjectStore(store, { keyPath });
			table.createIndex('accountId', 'accountId');
			if (store === 'outbox')
				table.createIndex('operation', ['accountId', 'entry.intent.operationId'], { unique: true });
		}
		database.createObjectStore('write-receipts', { keyPath: ['accountId', 'key'] });
		database.createObjectStore('imports', { keyPath: ['accountId', 'source'] });
	};
	const database = await requestValue(request);
	connections.push(database);
	return database;
};

afterEach(async () => {
	for (const database of connections.splice(0)) database.close();
	for (const name of names) await requestValue(indexedDB.deleteDatabase(name));
	names.clear();
});

describe('workspace transaction ownership', () => {
	it('preserves the original application failure after aborting a transaction', async () => {
		const database = await open();
		const failure = new Error('The saved resource could not be validated');
		const pending = database.transaction('rw', 'records', async () => {
			await database.table('records').put({ accountId: 'alice', key: 'note:1' });
			throw failure;
		});
		await expect(pending).rejects.toBe(failure);
	});
	it('rolls back all writes when application work fails', async () => {
		const database = await open();
		await database
			.transaction('rw', ['records', 'cursors'], async () => {
				await database.table('records').put({ accountId: 'alice', key: 'note:1' });
				await database.table('cursors').put({ accountId: 'alice', cursor: '5' });
				throw new Error('Could not finish settlement');
			})
			.catch(() => ({ kind: 'failure' }));
		expect(
			await Promise.all(['records', 'cursors'].map((store) => database.table(store).toArray()))
		).toEqual([[], []]);
	});
});

const savedVersion = { etag: syncEtag(1n), value: 'Original server copy' };
const migrationRows = () => {
	const operationId = crypto.randomUUID();
	const appliedOperationId = crypto.randomUUID();
	const [entry] = appendWrite(
		[],
		{
			operationId,
			key: 'note:1',
			command: 'save',
			base: savedVersion,
			basedOn: null,
			local: 'Unsent work',
			coalesce: null,
			references: []
		},
		1
	);
	return {
		outbox: { accountId: 'alice', entry },
		records: {
			accountId: 'alice',
			key: 'note:1',
			schemaVersion: 2,
			entry: { kind: 'present', cache: { kind: 'cached', snapshot: savedVersion } }
		},
		'write-receipts': {
			accountId: 'alice',
			key: 'note:2',
			receipt: {
				operationId: appliedOperationId,
				resource: { kind: 'found', snapshot: savedVersion }
			}
		},
		quarantine: {
			accountId: 'alice',
			source: 'outbox',
			key: 'damaged',
			message: 'Unreadable edit',
			impact: { kind: 'write', operationId: null },
			raw: { original: 'Recoverable content' }
		},
		acknowledgements: { accountId: 'alice', operationId: appliedOperationId },
		imports: { accountId: 'alice', source: 'legacy:note:1', operationId },
		'queue-heads': { accountId: 'alice', sequence: 1 },
		cursors: { accountId: 'alice', cursor: '7', inventoryComplete: true }
	};
};

describe('native workspace storage upgrade', () => {
	it('retains pending edits, cached bodies, receipt proof, import markers and recovery content in place', async () => {
		const name = nameForTest();
		const native = await openNativeVersionSix(name);
		const rows = migrationRows();
		const transaction = native.transaction(Object.keys(rows), 'readwrite');
		const done = completed(transaction);
		for (const [store, row] of Object.entries(rows)) transaction.objectStore(store).put(row);
		await done;
		native.close();
		const upgraded = await open(name);
		const recovered = Object.fromEntries(
			await Promise.all(
				Object.keys(rows).map(async (store) => [store, (await upgraded.table(store).toArray())[0]])
			)
		);
		expect(recovered).toEqual(rows);
	});
	it('upgrades after a cooperative old tab closes on versionchange', async () => {
		const name = nameForTest();
		const oldTab = await openNativeVersionSix(name);
		oldTab.onversionchange = () => oldTab.close();
		const upgraded = await open(name);
		expect(upgraded.backendDB().version).toBe(10);
	});
	it('closes this connection when a newer release needs to upgrade', async () => {
		const name = nameForTest();
		const database = await open(name);
		const upgraded = await requestValue(indexedDB.open(name, 11));
		connections.push(upgraded);
		expect(database.isOpen()).toBe(false);
	});
	it('asks the user to close older tabs when the storage upgrade is blocked', async () => {
		const name = nameForTest();
		const oldTab = await openNativeVersionSix(name);
		oldTab.onversionchange = () => undefined;
		await expect(open(name)).rejects.toThrow('Close other app tabs');
	});
	it('preserves queued work when a blocked upgrade is retried after the old tab closes', async () => {
		const name = nameForTest();
		const oldTab = await openNativeVersionSix(name);
		const row = migrationRows().outbox;
		const transaction = oldTab.transaction('outbox', 'readwrite');
		const done = completed(transaction);
		transaction.objectStore('outbox').put(row);
		await done;
		oldTab.onversionchange = () => undefined;
		await open(name).catch(() => ({ kind: 'failure' }));
		oldTab.close();
		const upgraded = await open(name);
		expect(await upgraded.table('outbox').toArray()).toEqual([row]);
	});
});
