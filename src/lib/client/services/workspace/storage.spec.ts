import { describe, expect, it } from 'vitest';
import { LocalStorageBootstrap } from '$lib/client/repositories/workspace/bootstrap';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { replicaProject } from '$lib/testing/workspace/fixtures/replica-records';
import { InMemoryWorkspaceReplica } from '$lib/testing/workspace/fakes/in-memory-replica';
import { testBootstrap, testWorkspaceAccount } from '$lib/testing/workspace/fixtures/workspace';
import { WorkspaceStorageService } from './storage';

/** One browser profile: its IndexedDB replica and its local storage. */
const device = () => {
	const values = new Map<string, string>();
	const replica = new InMemoryWorkspaceReplica<WorkspaceCommand, WorkspaceRecord>();
	const storage = new WorkspaceStorageService(
		replica,
		new LocalStorageBootstrap(() => ({
			getItem: (key) => values.get(key) ?? null,
			setItem: (key, value) => void values.set(key, value),
			removeItem: (key) => void values.delete(key)
		}))
	);
	return { replica, storage };
};

describe('deployment settings on this device', () => {
	it('reads saved settings back for the account that saved them', () => {
		const { storage } = device();
		storage.saveBootstrap(testBootstrap());
		expect(storage.readBootstrap(testWorkspaceAccount)).toEqual({
			kind: 'stored',
			value: testBootstrap()
		});
	});
	it('does not hand one account’s settings to another', () => {
		const { storage } = device();
		storage.saveBootstrap(testBootstrap());
		expect(storage.readBootstrap('a0000000-0000-4000-8000-000000000003')).toEqual({
			kind: 'absent'
		});
	});
	it('forgets the settings on sign-out', () => {
		const { storage } = device();
		storage.saveBootstrap(testBootstrap());
		storage.clearBootstrap();
		expect(storage.readBootstrap(testWorkspaceAccount)).toEqual({ kind: 'absent' });
	});
});

it('keeps an account’s downloaded records apart from the next account after a reset', async () => {
	const { storage } = device();
	const project = replicaProject(1);
	await storage.commitCache(testWorkspaceAccount, {
		put: [{ key: project.key, entry: { kind: 'present', snapshot: project.at(1n) } }]
	});
	await storage.resetAccount(testWorkspaceAccount);
	expect((await storage.read(testWorkspaceAccount)).cache.records).toEqual([]);
});
