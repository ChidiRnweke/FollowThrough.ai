import { describe, expect, it } from 'vitest';
import { RunContext } from '@openai/agents';
import { ToolLifecycleError } from '$lib/errors';
import type { PendingAgentDecision } from '$lib/models/agent';
import type { AgentToolSessionInput } from '$lib/server/controllers/agent/tool-sessions';
import {
	ToolPreferences,
	type ToolPreferencesDependencies
} from '$lib/server/controllers/agent/tool-preferences/controller';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
import { ToolAccess } from '$lib/server/services/agent/tools/preferences';
import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';
import { InMemoryToolPreferenceRepository } from '$lib/testing/agent/fakes/in-memory-tool-preferences';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { reviewedNoteFixture } from '$lib/testing/notes/fixtures/reviewed-changes';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	testActor,
	testConversationId,
	testProjectId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { agentToolRegistry } from './agent-tool-factory';

const setup = () => {
	const note = noteBuilder({ ...new NodeNoteMarkdown().read('Launch Monday.') });
	const fixture = reviewedNoteFixture(note);
	const preferences = new InMemoryToolPreferenceRepository();
	const settings = new ToolPreferences(
		capabilityDependencies<ToolPreferencesDependencies>({
			preferences: new ToolAccess(preferences),
			catalog: new AgentToolCatalogService()
		})
	);
	const factory = capabilityDependencies<ControllerFactory>({
		notes: () => fixture.controller,
		toolPreferences: () => settings
	});
	const open = agentToolRegistry(() => factory, new InMemoryToolRetriever(), testTokenizer);
	const input = (
		pendingDecisions: readonly PendingAgentDecision[] = []
	): AgentToolSessionInput => ({
		actor: testActor(),
		request: {
			prompt: 'Change launch day',
			conversationId: testConversationId(),
			projectId: testProjectId()
		},
		run: {
			executionMode: 'approval_required',
			model: 'test-model',
			provenanceId: testProvenanceId(),
			pendingDecisions
		},
		executor: { execute: (_call, action) => action() },
		signal: new AbortController().signal
	});
	return { ...fixture, note, preferences, open, input };
};

describe('Agent tool session startup', () => {
	it('restores the saved preparation before resumed execution can write', async () => {
		const fixture = setup();
		const review = await fixture.controller.prepareChange(
			testActor(),
			{
				kind: 'patch',
				noteId: fixture.note.id,
				edits: [{ oldText: 'Monday', newText: 'Tuesday' }]
			},
			'authored'
		);
		const pending: PendingAgentDecision = {
			callId: 'reviewed-edit',
			toolName: 'edit_note',
			arguments: { noteId: fixture.note.id, edits: [{ oldText: 'Monday', newText: 'Tuesday' }] },
			review: { kind: 'note_change', content: JSON.stringify(review) }
		};
		const registry = await fixture.open(fixture.input([pending]));
		const tool = registry.agentTools().find((tool) => tool.name === 'edit_note');
		if (!tool || tool.type !== 'function') throw new Error('Expected edit_note function tool');
		await tool.invoke(new RunContext(), JSON.stringify(pending.arguments), {
			toolCall: {
				type: 'function_call',
				name: pending.toolName,
				callId: pending.callId,
				arguments: JSON.stringify(pending.arguments)
			}
		});
		expect(fixture.content.notes[0].plainText).toBe('Launch Tuesday.');
	});
	it('refuses to open a saved body approval without its preparation', async () => {
		const fixture = setup();
		await expect(
			fixture.open(
				fixture.input([
					{
						callId: 'missing-review',
						toolName: 'edit_note',
						arguments: {
							noteId: fixture.note.id,
							edits: [{ oldText: 'Monday', newText: 'Tuesday' }]
						}
					}
				])
			)
		).rejects.toThrow(ToolLifecycleError);
	});
	it('uses current project authority when opening the registry', async () => {
		const fixture = setup();
		await fixture.preferences.upsertForProject(testActor(), testProjectId(), {
			toolName: 'get_note',
			enabled: false
		});
		const registry = await fixture.open(fixture.input());
		expect(registry.agentTools().map((tool) => tool.name)).not.toContain('get_note');
	});
});
