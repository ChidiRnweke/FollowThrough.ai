import { describe, expect, it } from 'vitest';
import type { WorkspaceReplicaRepository } from '$lib/client/repositories/workspace/replica';
import type { OutboxEntry, WriteDraft } from '$lib/models/outbox';
import { syncCursorSchema, syncEtag, type ResourceState } from '$lib/models/sync';

type Replica = WorkspaceReplicaRepository<string, string>;

const body = (version: bigint, value: string): ResourceState<string> => ({
	kind: 'present',
	snapshot: { etag: syncEtag(version), value }
});
const draft = (command: string): WriteDraft<string, string> => ({
	operationId: crypto.randomUUID(),
	key: 'note:1',
	command,
	base: null,
	basedOn: null,
	local: command,
	coalesce: null,
	references: []
});
const stored = async (replica: Replica, account = 'alice') =>
	(await replica.read(account)).cache.records.find((row) => row.key === 'note:1')?.entry;

/**
 * What the workspace relies on from device storage. The IndexedDB repository and the in-memory
 * fake both run it, so a scenario that passes against the fake holds in a browser too.
 * `replica` opens a fresh device with the accounts `alice` and `bob`.
 */
export const workspaceReplicaContract = (replica: () => Replica) =>
	describe('workspace replica contract', () => {
		it('keeps the newer version of a resource whichever order they arrive in', async () => {
			const storage = replica();
			await storage.commitCache('alice', { put: [{ key: 'note:1', entry: body(2n, 'Newer') }] });
			await storage.commitCache('alice', { put: [{ key: 'note:1', entry: body(1n, 'Older') }] });
			expect(await stored(storage)).toEqual(body(2n, 'Newer'));
		});
		it('keeps a tombstone over a body of the same version', async () => {
			const storage = replica();
			const deleted = { kind: 'deleted' as const, etag: syncEtag(2n) };
			await storage.commitCache('alice', { put: [{ key: 'note:1', entry: deleted }] });
			await storage.commitCache('alice', { put: [{ key: 'note:1', entry: body(2n, 'Body') }] });
			expect(await stored(storage)).toEqual(deleted);
		});
		it('never moves the checkpoint back or forgets a complete inventory', async () => {
			const storage = replica();
			await storage.commitCache('alice', {
				put: [],
				checkpoint: { cursor: syncCursorSchema.parse('5'), inventoryComplete: true }
			});
			await storage.commitCache('alice', {
				put: [],
				checkpoint: { cursor: syncCursorSchema.parse('3'), inventoryComplete: false }
			});
			const { cache } = await storage.read('alice');
			expect({ cursor: cache.cursor, complete: cache.inventoryComplete }).toEqual({
				cursor: syncCursorSchema.parse('5'),
				complete: true
			});
		});
		it('rejects a cache commit that names one resource twice', async () => {
			const storage = replica();
			await expect(
				storage.commitCache('alice', {
					put: [
						{ key: 'note:1', entry: body(1n, 'One') },
						{ key: 'note:1', entry: body(2n, 'Two') }
					]
				})
			).rejects.toThrow('A cache commit must touch each resource only once');
		});
		it('stores a transition’s queue, receipt and resource together', async () => {
			const storage = replica();
			const input = draft('Edit');
			await storage.transaction('alice', ['outbox', 'records', 'receipts'], async (tx) => {
				const previous = await tx.entries();
				const sequence = await tx.allocate(input);
				const entry: OutboxEntry<string, string> = {
					sequence,
					intent: { ...input, dependencies: [] },
					delivery: { kind: 'queued' }
				};
				await tx.replace(previous, [...previous, entry]);
				await tx.putReceipt('note:1', {
					operationId: input.operationId,
					resource: { kind: 'found', snapshot: { etag: syncEtag(1n), value: 'Edit' } }
				});
				await tx.receiveResource('note:1', body(1n, 'Edit'));
			});
			const { cache, writes } = await storage.read('alice');
			expect({
				queued: writes.entries.map((entry) => [entry.sequence, entry.intent.command]),
				receipt: writes.receipts.get('note:1')?.operationId,
				record: cache.records
			}).toEqual({
				queued: [[1, 'Edit']],
				receipt: input.operationId,
				record: [{ key: 'note:1', entry: body(1n, 'Edit') }]
			});
		});
		it('rolls back the allocation and every write of a failed transition', async () => {
			const storage = replica();
			await expect(
				storage.transaction('alice', ['outbox', 'records', 'receipts'], async (tx) => {
					await tx.allocate(draft('Lost'));
					await tx.receiveResource('note:1', body(1n, 'Lost'));
					throw new Error('The decision failed');
				})
			).rejects.toThrow('The decision failed');
			const sequence = await storage.transaction('alice', ['outbox'], (tx) =>
				tx.allocate(draft('Kept'))
			);
			expect({ sequence, record: await stored(storage) }).toEqual({
				sequence: 1,
				record: undefined
			});
		});
		it('keeps the newer resource when a transition receives an older one', async () => {
			const storage = replica();
			await storage.commitCache('alice', { put: [{ key: 'note:1', entry: body(3n, 'Newer') }] });
			await storage.transaction('alice', ['records'], (tx) =>
				tx.receiveResource('note:1', body(2n, 'Older'))
			);
			expect(await stored(storage)).toEqual(body(3n, 'Newer'));
		});
		it('keeps accounts apart', async () => {
			const storage = replica();
			await storage.commitCache('alice', { put: [{ key: 'note:1', entry: body(1n, 'Alice') }] });
			expect(await stored(storage, 'bob')).toBeUndefined();
		});
	});
