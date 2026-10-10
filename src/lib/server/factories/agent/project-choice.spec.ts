import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { ProjectDetailService } from '$lib/services/projects/details';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { expect, it } from 'vitest';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import { createAgentToolSurface } from './agent-tool-factory';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	projectBuilder,
	testActor,
	testConversationId,
	testProjectId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';

const toolsFor = (hasProject: boolean) => {
	const projects = new InMemoryProjectRepository();
	if (hasProject) projects.projects = [projectBuilder({ role: 'inbox', name: 'Renamed inbox' })];
	const catalog = createProjectServices(projects, projects);
	const controller = new Projects(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<ProjectsDependencies>({
			noteCreationRules: new NoteLifecycleRulesService(),
			details: new ProjectDetailService(),
			presentation: new ProjectTreePresentationService(),
			placement: catalog.placement,
			projectLifecycle: catalog.lifecycle,
			projectLister: catalog.lister
		})
	);
	return createAgentToolSurface(
		testTokenizer,
		capabilityDependencies<ControllerFactory>({ projects: () => controller }),
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
		{ execute: (_input, action) => action() },
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
