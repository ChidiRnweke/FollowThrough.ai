import type { AgentPayloadObject } from '$lib/models/agent/payload';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import {
	ProductionControllerFactory,
	type ProductionControllerDependencies
} from '$lib/server/factories/production-controller-factory';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	projectBuilder,
	testActor,
	testConversationId,
	testProjectId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { expect, it } from 'vitest';
import { createAgentToolSurface } from './agent-tool-factory';

const toolsFor = (hasProject: boolean) => {
	const projects = new InMemoryProjectRepository();
	if (hasProject) projects.projects = [projectBuilder({ role: 'inbox', name: 'Renamed inbox' })];
	const catalog = createProjectServices(projects, projects);

	return createAgentToolSurface(
		testTokenizer,
		new ProductionControllerFactory(
			capabilityDependencies<ProductionControllerDependencies>({
				notes: capabilityDependencies<ProductionControllerDependencies['notes']>({
					...agentToolResultsFixture(),
					projectLister: catalog.lister
				}),
				skills: capabilityDependencies<ProductionControllerDependencies['skills']>({
					...agentToolResultsFixture(),
					projectLister: catalog.lister
				}),
				diagramStudio: capabilityDependencies<ProductionControllerDependencies['diagramStudio']>({
					...agentToolResultsFixture(),
					projectLister: catalog.lister
				}),
				widgets: capabilityDependencies<ProductionControllerDependencies['widgets']>({
					...agentToolResultsFixture(),
					projectLister: catalog.lister
				})
			})
		),
		testActor(),
		'auto_accept',
		{
			provenanceId: testProvenanceId(),
			model: 'test/model',
			input: {
				conversationId: testConversationId(),
				projectId: testProjectId(),
				prompt: 'Create work'
			}
		},
		{ completed: async () => {} },
		new InMemoryToolRetriever(),
		{ isEnabled: () => true }
	).definitions();
};
const requests: { name: string; action: string; input: AgentPayloadObject }[] = [
	{
		name: 'create_widget',
		action: 'create a widget',
		input: { title: 'Dashboard', layout: 'invalid JSON', data: 'invalid JSON' }
	},
	{ name: 'create_note', action: 'create a note', input: { title: 'New note' } },
	{ name: 'create_skill', action: 'create a skill', input: { name: 'New skill' } },
	{ name: 'create_diagram', action: 'create a diagram', input: { source: 'flowchart LR\nA --> B' } }
];
it.each(requests)(
	'$name asks for explicit project choice even when an inbox is available',
	async ({ name, action, input }) => {
		const tool = toolsFor(true).find((tool) => tool.name === name);
		if (!tool) throw new Error(`Missing ${name}`);
		await expect(tool.prepare(input).execute()).rejects.toThrow(
			`projectId is required to ${action}. Retry naming one of these projects: Renamed inbox (${testProjectId()}).`
		);
	}
);
it.each(requests)(
	'$name reports an empty project inventory without inventing a destination',
	async ({ name, action, input }) => {
		const tool = toolsFor(false).find((tool) => tool.name === name);
		if (!tool) throw new Error(`Missing ${name}`);
		await expect(tool.prepare(input).execute()).rejects.toThrow(
			`projectId is required to ${action}, and this workspace has no projects yet. Call create_project first, then retry with its id.`
		);
	}
);
