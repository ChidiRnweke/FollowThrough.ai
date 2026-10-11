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
	it('rolls back all writes when application work fails', async () => {
		const database = await open();
		const failure = new Error('Could not finish settlement');
		let observed: unknown;
		await database
			.transaction('rw', ['records', 'meta'], async () => {
				await database.table('records').put({ accountId: 'alice', key: 'note:1' });
				await database.table('meta').put({ key: 'checkpoint', cursor: '5' });
				throw failure;
			})
			.catch((error: unknown) => {
				observed = error;
			});
		const records = await Promise.all(
			['records', 'meta'].map((store) => database.table(store).toArray())
		);
		expect({ observed, records }).toEqual({ observed: failure, records: [[], []] });
	});
});

it('closes this connection when another tab upgrades storage', async () => {
	const name = nameForTest();
	const database = await open(name);
	const upgraded = await requestValue(indexedDB.open(database.name, 11));
	connections.push(upgraded);
	expect(database.isOpen()).toBe(false);
});
