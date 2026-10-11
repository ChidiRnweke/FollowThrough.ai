import { describe, expect, it } from 'vitest';
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
	const entries = new InMemoryMemoryEntryRepository(actor);
	const projects = new InMemoryProjectRepository(actor);
	const provenance = new InMemoryProvenanceRepository(actor);
	projects.projects = [projectBuilder()];
	await provenance.insert({
		id: testProvenanceId(),
		userId: actor.userId,
		producerKind: 'agent',
		producerName: 'Agent memory',
		pipeline: 'memory',
		metadata: {},
		createdAt: testNow
	});
	const library = createMemoryServices(actor, entries, projects, provenance);
	const entry = await library.library.create(
		memoryEntryBuilder({ projectId: scope === 'project' ? testProjectId() : undefined })
	);
	return { actor, entries, projects, library, entry };
};

describe('memory owned by an archived project', () => {
	it.each(['get', 'getForEdit', 'remove'] as const)(
		'rejects %s after project archival',
		async (operation) => {
			const { projects, library, entry } = await setup();
			await projects.archive(testProjectId());
			await expect(
				{
					get: () => library.library.get(entry.id),
					getForEdit: () => library.library.getForEdit(entry.id),
					remove: () => library.library.remove(entry.id)
				}[operation]()
			).rejects.toThrow('Memory project was not found');
		}
	);

	it('preserves a resolved edit when its project has since been archived', async () => {
		const { entries, projects, library, entry } = await setup();
		await projects.archive(testProjectId());
		const outcome = await library.library.update({ ...entry, content: 'Replacement' }).then(
			() => 'unexpected success',
			(error: Error) => error.message
		);
		expect({ outcome, entries: entries.entries }).toEqual({
			outcome: 'Memory project was not found',
			entries: [entry]
		});
	});

	it('retains the stored record after its project is archived', async () => {
		const { entries, projects, entry } = await setup();
		await projects.archive(testProjectId());
		expect(await entries.findById(entry.id)).toEqual(entry);
	});

	it('allows profile memory edits after an unrelated project is archived', async () => {
		const { projects, library, entry } = await setup('user');
		await projects.archive(testProjectId());
		const updated = await library.library.update({
			...entry,
			content: 'Profile replacement'
		});
		expect(updated.content).toBe('Profile replacement');
	});

	it('allows edits while the project remains active', async () => {
		const { library, entry } = await setup();
		const current = await library.library.getForEdit(entry.id);
		const updated = await library.library.update({
			...current,
			content: 'Active replacement'
		});
		expect(updated.content).toBe('Active replacement');
	});
});
