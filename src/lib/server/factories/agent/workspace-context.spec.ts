import { describe, expect, it } from 'vitest';
import type { WorkspaceController } from '$lib/server/controllers/workspace/controller';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { directTool } from '$lib/testing/agent/fixtures/direct-tool';
import { createAgentToolSurface } from '$lib/testing/agent/fixtures/tool-surface';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	projectBuilder,
	testConversationId,
	testNoteId,
	testNow,
	testProvenanceId,
	userBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';

const project = projectBuilder();
const entry = (id: number, kind: 'note' | 'folder', position: number, parent?: number) =>
	noteBuilder({
		id: testNoteId(id),
		kind,
		title: `entry ${id}`,
		position,
		...(parent === undefined ? {} : { parentId: testNoteId(parent) })
	});

const workspaceContext = async () => {
	const workspace = capabilityDependencies<WorkspaceController>({
		getShellContext: async () => ({
			user: userBuilder(),
			projects: [project],
			// Stored order on purpose: children before parents, siblings out of position order.
			noteTree: [
				entry(4, 'note', 1, 2),
				entry(1, 'note', 0),
				entry(3, 'note', 0, 2),
				entry(5, 'folder', 2),
				entry(2, 'folder', 1)
			],
			skills: [],
			pendingSuggestionCount: 0,
			pendingMemoryNotifications: [],
			memory: { user: 0, projects: new Map([[project.id, 3]]) }
		})
	});
	const tool = createAgentToolSurface(
		testTokenizer,
		capabilityDependencies<ControllerFactory>({ workspace: () => workspace }),
		'auto_accept',
		{
			provenanceId: testProvenanceId(),
			input: { prompt: 'Orient', conversationId: testConversationId() },
			model: 'openai/gpt-5.6'
		},
		{ completed: async () => {} },
		new InMemoryToolRetriever(),
		{ isEnabled: () => true }
	)
		.definitions()
		.find((candidate) => candidate.name === 'get_workspace_context');
	return directTool(tool).prepare({}).execute(new AbortController().signal);
};

describe('get_workspace_context', () => {
	it("nests each project's notes under their folders in visible order, with memory counts", async () => {
		const node = (id: number) => ({ id: testNoteId(id), title: `entry ${id}`, createdAt: testNow });
		expect(await workspaceContext()).toMatchObject({
			userMemoryCount: 0,
			projects: [
				{
					id: project.id,
					memoryCount: 3,
					notes: [
						{ kind: 'note', ...node(1) },
						{
							kind: 'folder',
							...node(2),
							children: [
								{ kind: 'note', ...node(3) },
								{ kind: 'note', ...node(4) }
							]
						},
						{ kind: 'folder', ...node(5), children: [] }
					]
				}
			]
		});
	});
});
