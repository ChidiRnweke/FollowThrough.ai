import { describe, expect, it } from 'vitest';
import type { MemoryChangePayload, MemoryEntryId } from '$lib/models/memory';
import { createMemoryServices } from '$lib/server/factories/capabilities/memory-capability-factory';
import { MemoryRecords } from '$lib/server/repositories/memory/postgres/memory-entries';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { context, now, seedNote, seedProvenance } from '../database-harness';

const setup = async (suffix: string) => {
	const { owner, project } = await seedNote(suffix);
	const provenance = await seedProvenance(owner, suffix);
	const entries = new MemoryRecords(owner, context.db);
	const projects = new ProjectRecords(owner, context.db);
	const library = createMemoryServices(
		owner,
		entries,
		projects,
		new ProvenanceRecords(owner, context.db)
	);
	const entry = await library.creator.create({
		id: crypto.randomUUID() as MemoryEntryId,
		userId: owner.userId,
		projectId: project.id,
		content: 'Keep the deployment checklist.',
		shareWithAgents: true,
		createdAt: now,
		updatedAt: now
	});
	await projects.archive(project.id);
	return { owner, project, provenance, entries, library, entry };
};

describe('archived project memory boundaries', () => {
	it('hides a retained project entry from the application reader', async () => {
		const { library, entry } = await setup('22101');
		await expect(library.reader.get(entry.id)).rejects.toThrow('Memory project was not found');
	});

	it.each(['update', 'remove'] as const)(
		'refuses a pending %s without changing the retained entry',
		async (operation) => {
			const { project, provenance, entries, library, entry } = await setup(
				operation === 'update' ? '22102' : '22103'
			);
			const payload: MemoryChangePayload =
				operation === 'update'
					? {
							scope: 'project',
							projectId: project.id,
							operation,
							memoryEntryId: entry.id,
							content: 'Replacement'
						}
					: {
							scope: 'project',
							projectId: project.id,
							operation,
							memoryEntryId: entry.id
						};
			const outcome = await library.changes.apply(payload, provenance.id).then(
				() => 'unexpected success',
				(error: Error) => error.message
			);
			expect({ outcome, entries: await entries.list({ projectId: project.id }) }).toEqual({
				outcome: 'Memory project was not found',
				entries: [entry]
			});
		}
	);

	it('rejects direct deletion while preserving the stored entry', async () => {
		const { entries, library, entry } = await setup('22104');
		const outcome = await library.deleter.remove(entry.id).then(
			() => 'unexpected success',
			(error: Error) => error.message
		);
		expect({ outcome, entry: await entries.findById(entry.id) }).toEqual({
			outcome: 'Memory project was not found',
			entry
		});
	});
});
