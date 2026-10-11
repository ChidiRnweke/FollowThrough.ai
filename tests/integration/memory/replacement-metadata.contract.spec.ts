import { expect, it } from 'vitest';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createMemoryServices } from '$lib/server/factories/capabilities/memory-capability-factory';
import { MemoryRecords } from '$lib/server/repositories/memory/postgres/memory-entries';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import {
	memoryEntryBuilder,
	testMemoryEntryId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { context, seedNote, seedProvenance } from '../database-harness';

it('stores the existing classification on the active replacement entry', async () => {
	const { owner, project } = await seedNote('22901');
	const provenance = await seedProvenance(owner, '22901');
	const { database, transactionRunner } = createTransactionContext(context.db);
	const entries = new MemoryRecords(owner, database);
	const library = createMemoryServices(
		owner,
		entries,
		new ProjectRecords(owner, database),
		new ProvenanceRecords(owner, database)
	);
	const original = await library.library.create(
		memoryEntryBuilder({
			id: testMemoryEntryId(22901),
			userId: owner.userId,
			projectId: project.id,
			type: 'decision',
			content: 'Original decision'
		})
	);
	const { entry } = await transactionRunner.run(() =>
		library.changes.apply(
			{
				scope: 'project',
				projectId: project.id,
				operation: 'update',
				memoryEntryId: original.id,
				content: 'Revised decision'
			},
			provenance.id
		)
	);
	expect(
		(await entries.list({ projectId: project.id })).map((item) => ({
			id: item.id,
			type: item.type,
			content: item.content
		}))
	).toEqual([{ id: entry.id, type: 'decision', content: 'Revised decision' }]);
});
