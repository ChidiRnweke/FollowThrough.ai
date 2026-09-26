import { expect, it } from 'vitest';
import { MemoryLibrary } from './library';
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
	const entries = new InMemoryMemoryEntryRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const provenance = new InMemoryProvenanceRepository();
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
	const library = new MemoryLibrary(entries, projects, provenance);
	const original = await library.create(
		testActor(),
		memoryEntryBuilder({ type, content: 'Original convention' })
	);
	if (!original.projectId) throw new Error('The fixture must have a project');
	const { entry } = await library.apply(
		testActor(),
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
it.each(['fact', 'decision', 'constraint', 'preference'] as const)(
	'preserves the %s classification when a proposal replaces content',
	async (type) => {
		expect((await replace(type)).type).toBe(type);
	}
);
it('keeps an unclassified memory unclassified after replacement', async () => {
	expect((await replace()).type).toBeUndefined();
});
