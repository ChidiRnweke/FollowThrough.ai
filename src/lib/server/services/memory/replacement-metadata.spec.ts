import { expect, it } from 'vitest';
import { createMemoryServices } from '$lib/server/factories/capabilities/memory-capability-factory';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import {
	memoryEntryBuilder,
	projectBuilder,
	testActor,
	testNow,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { MemoryEntryType } from '$lib/models/memory';

const replace = async (type?: MemoryEntryType) => {
	const entries = new InMemoryMemoryEntryRepository(testActor());
	const projects = new InMemoryProjectRepository(testActor());
	projects.projects = [projectBuilder()];
	const provenance = new InMemoryProvenanceRepository(testActor());
	provenance.provenance = [
		{
			id: testProvenanceId(),
			userId: testActor().userId,
			createdAt: testNow,
			producerKind: 'agent',
			producerName: 'MCP client',
			pipeline: 'agent',
			metadata: { scope: 'full' }
		}
	];
	const library = createMemoryServices(testActor(), entries, projects, provenance);
	const original = await library.library.create(
		memoryEntryBuilder({ type, content: 'Original convention' })
	);
	if (!original.projectId) throw new Error('The fixture must have a project');
	const { entry } = await library.changes.apply(
		{
			scope: 'project',
			projectId: original.projectId,
			operation: 'update',
			memoryEntryId: original.id,
			content: 'Revised convention'
		},
		testProvenanceId()
	);
	return entry;
};
it('keeps an unclassified memory unclassified after replacement', async () => {
	expect((await replace()).type).toBeUndefined();
});
