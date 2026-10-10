import { describe, expect, it } from 'vitest';
import type { MemoryChangePayload } from '$lib/models/memory';
import { createMemoryServices } from '$lib/server/factories/capabilities/memory-capability-factory';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import {
	memoryEntryBuilder,
	projectBuilder,
	testActor,
	testNow,
	testProjectId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = async (scope: 'project' | 'user' = 'project') => {
	const actor = testActor();
	const entries = new InMemoryMemoryEntryRepository();
	const projects = new InMemoryProjectRepository();
	const provenance = new InMemoryProvenanceRepository();
	projects.projects = [projectBuilder()];
	await provenance.insert(actor, {
		id: testProvenanceId(),
		userId: actor.userId,
		producerKind: 'agent',
		producerName: 'Agent memory',
		pipeline: 'memory',
		metadata: {},
		createdAt: testNow
	});
	const library = createMemoryServices(entries, projects, provenance);
	const entry = await library.creator.create(
		actor,
		memoryEntryBuilder({ projectId: scope === 'project' ? testProjectId() : undefined })
	);
	return { actor, entries, projects, library, entry };
};

describe('memory owned by an archived project', () => {
	it.each(['get', 'getForEdit', 'remove'] as const)(
		'rejects %s after project archival',
		async (operation) => {
			const { actor, projects, library, entry } = await setup();
			await projects.archive(actor, testProjectId());
			await expect(
				{
					get: () => library.reader.get(actor, entry.id),
					getForEdit: () => library.editor.getForEdit(actor, entry.id),
					remove: () => library.deleter.remove(actor, entry.id)
				}[operation]()
			).rejects.toThrow('Memory project was not found');
		}
	);

	it.each(['update', 'remove'] as const)(
		'preserves memory when a pending %s proposal outlives its project',
		async (operation) => {
			const { actor, entries, projects, library, entry } = await setup();
			const payload: MemoryChangePayload =
				operation === 'update'
					? {
							scope: 'project',
							projectId: testProjectId(),
							operation,
							memoryEntryId: entry.id,
							content: 'Replacement'
						}
					: {
							scope: 'project',
							projectId: testProjectId(),
							operation,
							memoryEntryId: entry.id
						};
			await projects.archive(actor, testProjectId());
			const outcome = await library.changes.apply(actor, payload, testProvenanceId()).then(
				() => 'unexpected success',
				(error: Error) => error.message
			);
			expect({ outcome, entries: entries.entries }).toEqual({
				outcome: 'Memory project was not found',
				entries: [entry]
			});
		}
	);

	it('preserves a resolved edit when its project has since been archived', async () => {
		const { actor, entries, projects, library, entry } = await setup();
		await projects.archive(actor, testProjectId());
		const outcome = await library.editor.update(actor, { ...entry, content: 'Replacement' }).then(
			() => 'unexpected success',
			(error: Error) => error.message
		);
		expect({ outcome, entries: entries.entries }).toEqual({
			outcome: 'Memory project was not found',
			entries: [entry]
		});
	});

	it('retains the stored record after its project is archived', async () => {
		const { actor, entries, projects, entry } = await setup();
		await projects.archive(actor, testProjectId());
		expect(await entries.findById(actor, entry.id)).toEqual(entry);
	});

	it('allows profile memory edits after an unrelated project is archived', async () => {
		const { actor, projects, library, entry } = await setup('user');
		await projects.archive(actor, testProjectId());
		const updated = await library.editor.update(actor, {
			...entry,
			content: 'Profile replacement'
		});
		expect(updated.content).toBe('Profile replacement');
	});

	it('allows edits while the project remains active', async () => {
		const { actor, library, entry } = await setup();
		const current = await library.editor.getForEdit(actor, entry.id);
		const updated = await library.editor.update(actor, {
			...current,
			content: 'Active replacement'
		});
		expect(updated.content).toBe('Active replacement');
	});
});
