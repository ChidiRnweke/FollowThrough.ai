import { afterEach, describe, expect, it } from 'vitest';
import { openSyncDatabase, requestValue, transactionLifetime } from './database';

const databases: IDBDatabase[] = [];
afterEach(async () => {
	for (const database of databases.splice(0)) {
		database.close();
		await requestValue(indexedDB.deleteDatabase(database.name));
	}
});
const setup = async () => {
	const database = await openSyncDatabase(
		`transaction-cleanup-${crypto.randomUUID()}`,
		() => undefined
	);
	databases.push(database);
	const transaction = database.transaction('records', 'readwrite');
	return { transaction, ...transactionLifetime(transaction) };
};

describe('IndexedDB transaction cleanup', () => {
	it('does not replace a failure with InvalidStateError after a transaction completed', async () => {
		const { done, abort } = await setup();
		await done;
		expect(abort).not.toThrow();
	});
	it('can clean up a transaction that already aborted', async () => {
		const { transaction, done, abort } = await setup();
		transaction.abort();
		await done.catch(() => ({ kind: 'failure' }));
		expect(abort).not.toThrow();
	});
	it('rolls back pending storage work on failure', async () => {
		const { transaction, done, abort } = await setup();
		transaction.objectStore('records').put({ accountId: 'user-a', key: 'note:1' });
		abort();
		await done.catch(() => ({ kind: 'failure' }));
		expect(
			await requestValue(transaction.db.transaction('records').objectStore('records').getAll())
		).toEqual([]);
	});
});
