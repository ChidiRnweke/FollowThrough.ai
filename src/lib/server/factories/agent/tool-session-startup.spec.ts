import { ToolLifecycleError } from '$lib/errors';
import type { PendingAgentDecision } from '$lib/models/agent';
import { NoteMarkdownCodec } from '$lib/infrastructure/notes/markdown';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { reviewedNoteFixture } from '$lib/testing/notes/fixtures/reviewed-changes';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	testConversationId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { RunContext } from '@openai/agents';
import { describe, expect, it } from 'vitest';
import { createAgentToolSurface } from '$lib/testing/agent/fixtures/tool-surface';

const setup = () => {
	const note = noteBuilder({ ...new NoteMarkdownCodec().read('Launch Monday.') });
	const fixture = reviewedNoteFixture(note);
	const factory = capabilityDependencies<ControllerFactory>({ notes: () => fixture.controller });
	const open = (parked: readonly PendingAgentDecision[] = []) =>
		createAgentToolSurface(
			testTokenizer,
			factory,
			'approval_required',
			{
				provenanceId: testProvenanceId(),
				input: { prompt: 'Change launch day', conversationId: testConversationId() },
				model: 'test-model'
			},
			{ completed: async () => {} },
			new InMemoryToolRetriever(),
			{ isEnabled: () => true },
			parked
		);
	return { ...fixture, note, open };
};

describe('Resuming reviewed tool calls', () => {
	it('restores the saved preparation before resumed execution can write', async () => {
		const fixture = setup();
		const review = await fixture.controller.prepareChange(
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
		const registry = fixture.open([pending]);
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
		expect(() =>
			fixture
				.open([
					{
						callId: 'missing-review',
						toolName: 'edit_note',
						arguments: {
							noteId: fixture.note.id,
							edits: [{ oldText: 'Monday', newText: 'Tuesday' }]
						}
					}
				])
				.agentTools()
		).toThrow(ToolLifecycleError);
	});
});
