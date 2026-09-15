import { afterEach, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { z } from 'zod';
import { Dexie } from 'dexie';
import { DexieWorkspaceRepository } from '$lib/client/sync/workspace-local-repository';
import { IndexedDbStorageRecovery } from '$lib/client/sync/storage-recovery';
import { receiveResource, syncEtag } from '$lib/models/sync';
import WorkspaceRecoveryDownload from './workspace-recovery-download.svelte';
const cleanups: (() => Promise<void>)[] = [];
const setup = async () => {
	const prefix = `reset-review-${crypto.randomUUID()}`;
	const store = new DexieWorkspaceRepository('alice', z.string(), z.string(), prefix);
	const recovery = new IndexedDbStorageRecovery(prefix);
	await store.cache.commit('alice', {
		put: [
			{
				key: 'note',
				entry: receiveResource(undefined, { etag: syncEtag(1n), value: 'Keep my draft' })
			}
		],
		remove: []
	});
	cleanups.push(async () => {
		store.database.close();
		await Dexie.delete(store.database.name);
	});
	const reset = Promise.withResolvers<void>();
	const screen = render(WorkspaceRecoveryDownload, {
		recovery: {
			downloadLocalWrites: () => recovery.downloadAccount('alice'),
			resetLocalWorkspace: () => recovery.resetAccount('alice')
		},
		reloaded: reset.resolve
	});
	return { store, screen, reset: reset.promise };
};
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});
it('keeps local data when the reset confirmation is cancelled', async () => {
	const { store, screen } = await setup();
	await screen.getByRole('button', { name: 'Reset this device…', exact: true }).click();
	await screen.getByRole('button', { name: 'Cancel', exact: true }).click();
	expect((await store.read('alice')).cache.records).toHaveLength(1);
});
it('does not reset until the destructive action is confirmed', async () => {
	const { store, screen } = await setup();
	await screen.getByRole('button', { name: 'Reset this device…', exact: true }).click();
	expect((await store.read('alice')).cache.records).toHaveLength(1);
});
it('resets this account after explicit confirmation', async () => {
	const { store, screen, reset } = await setup();
	await screen.getByRole('button', { name: 'Reset this device…', exact: true }).click();
	await screen.getByRole('button', { name: 'Reset local workspace', exact: true }).click();
	await reset;
	expect(await Dexie.exists(store.database.name)).toBe(false);
});
