import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceDatabase, requestValue } from './database';

const connections: { close(): void }[] = [];
const names = new Set<string>();
const nameForTest = () => {
	const name = `workspace-storage-${crypto.randomUUID()}`;
	names.add(new WorkspaceDatabase('alice', name).name);
	return name;
};
const open = async (name = nameForTest()) => {
	const database = new WorkspaceDatabase('alice', name);
	connections.push(database);
	await database.ready();
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
			.transaction('rw', ['records', 'meta'], async () => {
				await database.table('records').put({ accountId: 'alice', key: 'note:1' });
				await database.table('meta').put({ key: 'checkpoint', cursor: '5' });
				throw new Error('Could not finish settlement');
			})
			.catch(() => ({ kind: 'failure' }));
		expect(
			await Promise.all(['records', 'meta'].map((store) => database.table(store).toArray()))
		).toEqual([[], []]);
	});
});

it('closes this connection when another tab upgrades storage', async () => {
	const name = nameForTest();
	const database = await open(name);
	const upgraded = await requestValue(indexedDB.open(database.name, 11));
	connections.push(upgraded);
	expect(database.isOpen()).toBe(false);
});
