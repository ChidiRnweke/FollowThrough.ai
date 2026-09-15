import { describe, expect, it } from 'vitest';
import type { MemoryEntryId } from '$lib/models/memory';
import { Memory, type MemoryDependencies } from '$lib/server/controllers/memory/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { createMemoryCapability } from '$lib/server/factories/capabilities/memory-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { EmbeddedMemoryIndexer } from '$lib/server/services/knowledge-search/indexing';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const sync = createSyncCapability({ db: database, transactionRunner });
	const { library } = createMemoryCapability({
		db: database,
		projects: new ProjectRecords(database),
		provenance: new ProvenanceRecords(database),
		indexer: new EmbeddedMemoryIndexer(
			new InMemorySearchRepository(),
			new InMemoryEmbeddingClient()
		)
	});
	const controller = new Memory(
		capabilityDependencies<MemoryDependencies>({
			syncMutations: sync.mutations,
			memoryCreator: library,
			memoryEditor: library,
			memoryDeleter: library
		})
	);
	return { ...seeded, controller, sync };
};

describe('guarded memory mutations', () => {
	it('creates a stable local identity only once after a lost response', async () => {
		const { owner, controller } = await setup('9371');
		const id = crypto.randomUUID() as MemoryEntryId;
		const input = {
			operationId: crypto.randomUUID(),
			baseEtag: null,
			command: {
				kind: 'createMemory' as const,
				id,
				content: 'Offline memory',
				shareWithAgents: true
			}
		};
		await controller.synchronize(owner, input);
		await controller.synchronize(owner, input);
		expect(await context.client`select id, content from memory_entries where id = ${id}`).toEqual([
			{ id, content: 'Offline memory' }
		]);
	});
	it('retains a competing edit when the submitted base is stale', async () => {
		const { owner, controller, sync } = await setup('9372');
		const { entry } = await controller.create(owner, { content: 'Original' });
		const base = await sync.objects.read(owner, { type: 'memory_entries', id: [entry.id] }, null);
		if (base.kind !== 'found') throw new Error('The created memory must exist');
		await context.client`update memory_entries set content = 'Other client' where id = ${entry.id}`;
		const result = await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: base.snapshot.etag,
			command: { kind: 'updateMemory', memoryEntryId: entry.id, content: 'Offline edit' }
		});
		expect({
			kind: result.kind,
			rows: await context.client`select content from memory_entries where id = ${entry.id}`
		}).toEqual({ kind: 'conflict', rows: [{ content: 'Other client' }] });
	});
	it('keeps the domain’s soft deletion in the authoritative resource', async () => {
		const { owner, controller, sync } = await setup('9373');
		const { entry } = await controller.create(owner, { content: 'Remove me' });
		const base = await sync.objects.read(owner, { type: 'memory_entries', id: [entry.id] }, null);
		if (base.kind !== 'found') throw new Error('The created memory must exist');
		const result = await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: base.snapshot.etag,
			command: { kind: 'deleteMemory', memoryEntryId: entry.id }
		});
		expect({
			kind: result.kind,
			rows: await context.client`select deleted_at is not null as deleted from memory_entries where id = ${entry.id}`
		}).toEqual({ kind: 'applied', rows: [{ deleted: true }] });
	});
});
