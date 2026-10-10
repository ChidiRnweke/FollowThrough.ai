import { MemoryEditingService } from '$lib/services/memory/edits';
import { MemoryPresentationService } from '$lib/services/memory/presentation';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { expect, it } from 'vitest';
import { AgentTools } from './agent-tool-factory';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { Memory, type MemoryDependencies } from '$lib/server/controllers/memory/controller';
import { createMemoryServices } from '$lib/server/factories/capabilities/memory-capability-factory';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	memoryEntryBuilder,
	projectBuilder,
	testActor,
	testConversationId,
	testMemoryEntryId,
	testNow,
	testProjectId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = (scope: 'user' | 'project') => {
	const projectId = scope === 'project' ? testProjectId() : undefined;
	const entries = new InMemoryMemoryEntryRepository();
	const shared = memoryEntryBuilder({
		id: testMemoryEntryId(1),
		projectId,
		content: 'Shared fact'
	});
	entries.entries = [
		shared,
		memoryEntryBuilder({
			id: testMemoryEntryId(2),
			projectId,
			shareWithAgents: false,
			content: 'Private fact'
		}),
		memoryEntryBuilder({
			id: testMemoryEntryId(3),
			projectId,
			deletedAt: testNow,
			content: 'Removed fact'
		}),
		memoryEntryBuilder({
			id: testMemoryEntryId(4),
			projectId: scope === 'project' ? undefined : testProjectId(),
			content: 'Other scope'
		}),
		memoryEntryBuilder({
			id: testMemoryEntryId(5),
			userId: testActor(2).userId,
			projectId: undefined,
			content: 'Another actor'
		})
	];
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const library = createMemoryServices(entries, projects, new InMemoryProvenanceRepository());
	const controller = new Memory(
		capabilityDependencies<MemoryDependencies>({
			editing: new MemoryEditingService(),
			presentation: new MemoryPresentationService(),
			memoryLister: library.lister
		})
	);
	const factory = capabilityDependencies<ControllerFactory>({ memory: () => controller });
	const tools = new AgentTools(
		testTokenizer,
		factory,
		testActor(),
		'auto_accept',
		{
			provenanceId: testProvenanceId(),
			input: { conversationId: testConversationId(), prompt: 'Read memory' },
			model: 'test/model'
		},
		{ execute: (_input, action) => action() },
		new InMemoryToolRetriever(),
		{ isEnabled: () => true }
	);
	const tool = tools
		.definitions()
		.find(
			(definition) =>
				definition.name === (scope === 'project' ? 'list_project_memory' : 'list_user_memory')
		);
	if (!tool) throw new Error('Memory read tool is missing');
	return { tool, projects, shared, projectId };
};
it.each(['user', 'project'] as const)(
	'lists only shared active %s memory through the agent tool',
	async (scope) => {
		const { tool, shared, projectId } = setup(scope);
		const result = await tool.prepare(projectId ? { projectId } : {}).execute();
		expect(result).toEqual({
			entries: [
				{
					id: shared.id,
					content: shared.content,
					createdAt: shared.createdAt,
					...(projectId ? { projectId } : {})
				}
			]
		});
	}
);
it('refuses an archived project through the agent memory tool', async () => {
	const { tool, projects } = setup('project');
	await projects.archive(testActor(), testProjectId());
	await expect(tool.prepare({ projectId: testProjectId() }).execute()).rejects.toThrow(
		'Memory project was not found'
	);
});
