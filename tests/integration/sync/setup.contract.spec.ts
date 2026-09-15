import { WorkspaceSyncReceipts } from '$lib/server/repositories/workspace/sync-receipts';
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

it('seeds an existing source record that has no sync metadata', async () => {
	const { owner, note } = await seedNote('8833');
	await context.client`delete from workspace_sync_versions where resource_type = 'notes' and resource_id = jsonb_build_array(${note.id}::text)`;
	await context.client`delete from workspace_sync_changes where account_id = ${owner.userId} and resource_type = 'notes' and resource_id = jsonb_build_array(${note.id}::text)`;
	await installWorkspaceSync(context.client);
	const page = await new WorkspaceSyncChanges(context.db).pullPage(owner, initialSyncCursor);
	expect(
		page.records.some(
			(record) =>
				record.resource.kind === 'found' &&
				record.resource.snapshot.value.type === 'notes' &&
				record.resource.snapshot.value.value.id === note.id
		)
	).toBe(true);
});

it('preserves tombstones and cancellation proofs during reinstallation', async () => {
	const { owner, note } = await seedNote('8824');
	const operationId = '90000000-0000-4000-8000-000000008824';
	const receipts = new WorkspaceSyncReceipts(context.db);
	await receipts.cancel(owner, operationId, '{}');
	await context.client`delete from notes where id = ${note.id}`;
	const journal = new WorkspaceSyncChanges(context.db);
	const before = await journal.pullPage(owner, initialSyncCursor);
	await installWorkspaceSync(context.client);
	expect({
		page: await journal.pullPage(owner, initialSyncCursor),
		proof: await receipts.find(owner, operationId, '{}')
	}).toEqual({ page: before, proof: { kind: 'cancelled' } });
});
