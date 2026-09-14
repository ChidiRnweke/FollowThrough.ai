import { expect, it } from 'vitest';
import { initialSyncCursor } from '$lib/models/sync';
import { WorkspaceSyncChanges } from '$lib/server/repositories/workspace/sync-changes';
import { installWorkspaceSync } from '../../../scripts/setup-workspace-sync';
import { context, seedNote } from '../database-harness';
it('can reinstall development sync SQL without advancing existing account checkpoints', async () => {
	const { owner } = await seedNote('8822');
	const journal = new WorkspaceSyncChanges(context.db);
	const before = await journal.pullPage(owner, initialSyncCursor);
	await installWorkspaceSync(context.client);
	await installWorkspaceSync(context.client);
	expect(await journal.pullPage(owner, before.cursor)).toEqual({
		cursor: before.cursor,
		records: [],
		hasMore: false
	});
});
