import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { WorkspaceSyncReceipts } from '$lib/server/repositories/workspace/sync-receipts';
import { WorkspaceSyncObjects } from '$lib/server/repositories/workspace/sync-objects';
import type { WorkspaceWriteReceipt } from '$lib/models/workspace-records';
import { context, seedNote } from '../database-harness';

const savedReceipt = async (suffix: string) => {
	const { owner, note } = await seedNote(suffix);
	const operationId = crypto.randomUUID();
	const identity = { type: 'notes' as const, id: [note.id] as [string] };
	const request = JSON.stringify({ kind: 'renameNote', noteId: note.id, title: 'Renamed' });
	const receipt = await context.db.transaction(async (transaction) => {
		const receipts = new WorkspaceSyncReceipts(transaction);
		await receipts.lockOperation(owner, operationId);
		await receipts.lockResource(owner, identity);
		await transaction.execute(sql`update notes set title = 'Renamed' where id = ${note.id}`);
		const resource = await new WorkspaceSyncObjects(transaction).read(owner, identity, null);
		if (resource.kind !== 'found') throw new Error('Seeded note was not readable');
		const receipt: WorkspaceWriteReceipt = { operationId, resource };
		await receipts.save(owner, request, receipt);
		return receipt;
	});
	return { owner, note, identity, request, receipt };
};

describe('durable synchronization operation receipts', () => {
	it('returns the original authoritative receipt when retrying identical input', async () => {
		const { owner, request, receipt } = await savedReceipt('8901');
		expect(
			await new WorkspaceSyncReceipts(context.db).find(owner, receipt.operationId, request)
		).toEqual({ kind: 'receipt', receipt });
	});

	it('recognizes equivalent input independently of JSON object key order', async () => {
		const { owner, note, receipt } = await savedReceipt('8902');
		const reordered = JSON.stringify({ title: 'Renamed', noteId: note.id, kind: 'renameNote' });
		expect(
			await new WorkspaceSyncReceipts(context.db).find(owner, receipt.operationId, reordered)
		).toEqual({ kind: 'receipt', receipt });
	});

	it('rejects reuse of an operation identity with different input', async () => {
		const { owner, note, receipt } = await savedReceipt('8903');
		const changed = JSON.stringify({ kind: 'renameNote', noteId: note.id, title: 'Different' });
		expect(
			await new WorkspaceSyncReceipts(context.db).find(owner, receipt.operationId, changed)
		).toEqual({ kind: 'reused' });
	});

	it('does not disclose another account’s receipt', async () => {
		const { owner: other } = await seedNote('8904');
		const { request, receipt } = await savedReceipt('8905');
		expect(
			await new WorkspaceSyncReceipts(context.db).find(other, receipt.operationId, request)
		).toEqual({ kind: 'missing' });
	});

	it('rolls back the domain write and its receipt together', async () => {
		const { owner, note } = await seedNote('8906');
		const operationId = crypto.randomUUID();
		const request = JSON.stringify({ kind: 'renameNote', noteId: note.id, title: 'Rejected' });
		await context.db
			.transaction(async (transaction) => {
				const receipts = new WorkspaceSyncReceipts(transaction);
				const identity = { type: 'notes' as const, id: [note.id] as [string] };
				await receipts.lockOperation(owner, operationId);
				await receipts.lockResource(owner, identity);
				await transaction.execute(sql`update notes set title = 'Rejected' where id = ${note.id}`);
				const resource = await new WorkspaceSyncObjects(transaction).read(owner, identity, null);
				if (resource.kind !== 'found') throw new Error('Updated note was not readable');
				await receipts.save(owner, request, { operationId, resource });
				throw new Error('Reject domain transaction');
			})
			.catch(() => {
				return { kind: 'failure' };
			});
		const receipt = await new WorkspaceSyncReceipts(context.db).find(owner, operationId, request);
		const rows = await context.client<
			{ title: string }[]
		>`select title from notes where id = ${note.id}`;
		expect({ receipt, title: rows[0]?.title }).toEqual({
			receipt: { kind: 'missing' },
			title: note.title
		});
	});
});

it('retains the original proof after compacting an acknowledged receipt twice', async () => {
	const { owner, request, receipt, note } = await savedReceipt('8910');
	const receipts = new WorkspaceSyncReceipts(context.db);
	await receipts.compact(owner, receipt.operationId);
	await context.client`update notes set title = 'Later edit' where id = ${note.id}`;
	await receipts.compact(owner, receipt.operationId);
	const resource = receipt.resource;
	expect(await receipts.find(owner, receipt.operationId, request)).toEqual({
		kind: 'compacted',
		proof: {
			operationId: receipt.operationId,
			resourceKind: resource.kind,
			etag: resource.kind === 'found' ? resource.snapshot.etag : resource.etag
		}
	});
});
it('retains cancellation proof after repeated acknowledgement', async () => {
	const { owner } = await seedNote('8911');
	const operationId = crypto.randomUUID();
	await context.db.transaction(async (transaction) => {
		const receipts = new WorkspaceSyncReceipts(transaction);
		await receipts.lockOperation(owner, operationId);
		await receipts.cancel(owner, operationId, '{"command":"cancelled"}');
	});
	const receipts = new WorkspaceSyncReceipts(context.db);
	await receipts.compact(owner, operationId);
	await receipts.compact(owner, operationId);
	expect(await receipts.find(owner, operationId, '{"command":"cancelled"}')).toEqual({
		kind: 'cancelled'
	});
});
it('still rejects different input after the receipt payload is compacted', async () => {
	const { owner, receipt } = await savedReceipt('8912');
	const receipts = new WorkspaceSyncReceipts(context.db);
	await receipts.compact(owner, receipt.operationId);
	expect(await receipts.find(owner, receipt.operationId, '{"different":true}')).toEqual({
		kind: 'reused'
	});
});

it('preserves the same proof when acknowledgements arrive concurrently', async () => {
	const { owner, request, receipt } = await savedReceipt('8913');
	const receipts = new WorkspaceSyncReceipts(context.db);
	const other = connectPostgresTestDatabase(context.url);
	try {
		await Promise.all([
			receipts.compact(owner, receipt.operationId),
			new WorkspaceSyncReceipts(other.db).compact(owner, receipt.operationId)
		]);
	} finally {
		await other.close();
	}
	const resource = receipt.resource;
	expect(await receipts.find(owner, receipt.operationId, request)).toEqual({
		kind: 'compacted',
		proof: {
			operationId: receipt.operationId,
			resourceKind: resource.kind,
			etag: resource.kind === 'found' ? resource.snapshot.etag : resource.etag
		}
	});
});

it('does not create a receipt when acknowledging an unknown operation repeatedly', async () => {
	const { owner } = await seedNote('8914');
	const operationId = crypto.randomUUID();
	const receipts = new WorkspaceSyncReceipts(context.db);
	await receipts.compact(owner, operationId);
	await receipts.compact(owner, operationId);
	expect(await receipts.find(owner, operationId, '{"command":"missing"}')).toEqual({
		kind: 'missing'
	});
});
