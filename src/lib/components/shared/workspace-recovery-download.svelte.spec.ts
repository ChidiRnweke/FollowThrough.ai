import { afterEach, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { z } from 'zod';
import { Dexie } from 'dexie';
import { IndexedDbWorkspaceReplica } from '$lib/client/repositories/workspace/replica';
import { accountDatabaseName } from '$lib/client/repositories/workspace/database';
import { syncEtag } from '$lib/models/sync';
import WorkspaceRecoveryDownload from './workspace-recovery-download.svelte';

const cleanups: (() => Promise<void>)[] = [];
/** Alice's device holds one downloaded body; the page offers recovery over that storage. */
const setup = async () => {
	const prefix = `reset-review-${crypto.randomUUID()}`;
	const replica = new IndexedDbWorkspaceReplica(z.string(), z.string(), prefix);
	replica.open('alice');
	await replica.commitCache('alice', {
		put: [
			{
				key: 'note',
				entry: { kind: 'present', snapshot: { etag: syncEtag(1n), value: 'Keep my draft' } }
			}
		]
	});
	cleanups.push(async () => {
		replica.close('alice');
		await Dexie.delete(accountDatabaseName('alice', prefix));
	});
	const reset = Promise.withResolvers<void>();
	const screen = render(WorkspaceRecoveryDownload, {
		recovery: {
			downloadLocalWrites: () => replica.exportAccount('alice'),
			resetLocalWorkspace: () => replica.resetAccount('alice')
		},
		reloaded: reset.resolve
	});
	/** What a tab opened now would find on this device. */
	const stored = async () => {
		const reader = new IndexedDbWorkspaceReplica(z.string(), z.string(), prefix);
		reader.open('alice');
		const records = (await reader.read('alice')).cache.records.length;
		reader.close('alice');
		return records;
	};
	return { screen, stored, prefix, reset: reset.promise };
};
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});
it('keeps local data when the reset confirmation is cancelled', async () => {
	const { screen, stored } = await setup();
	await screen.getByRole('button', { name: 'Reset this device…', exact: true }).click();
	await screen.getByRole('button', { name: 'Cancel', exact: true }).click();
	expect(await stored()).toBe(1);
});
it('resets this account after explicit confirmation', async () => {
	const { screen, reset, prefix } = await setup();
	await screen.getByRole('button', { name: 'Reset this device…', exact: true }).click();
	await screen.getByRole('button', { name: 'Reset local workspace', exact: true }).click();
	await reset;
	expect(await Dexie.exists(accountDatabaseName('alice', prefix))).toBe(false);
});
