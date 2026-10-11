import { describe, expect, it } from 'vitest';
import type { ConversationId } from '$lib/models/agent';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { createAgentTools } from '$lib/server/factories/agent/tools/definitions';
import { agentContextFixture } from '$lib/testing/agent/fixtures/context';
import {
	testActor,
	testConversationId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { FunctionTool } from '@openai/agents';

const request = () => ({ conversationId: crypto.randomUUID() as ConversationId, prompt: 'Help' });

describe('Agent harness turns', () => {
	it('fails clearly when no model provider key is configured', async () => {
		const fixture = agentContextFixture({ agentAvailable: false });
		await expect(
			fixture.builder.build(testActor(), request(), { provenanceId: testProvenanceId() })
		).rejects.toThrow('OPENROUTER_API_KEY');
	});

	// The call a run parks on is in neither the transcript nor the session — the SDK drops
	// approval items before persisting — so without the run's own pending decisions the tool
	// deserializes as gated-off and `RunState.fromString` throws `Tool <name> not found`.
	// Every approval of a long-tail mutation failed this way.
	it('offers the long-tail tool a parked run is about to answer for', async () => {
		const tools = createAgentTools({} as ControllerFactory, testActor(), {
			provenanceId: testProvenanceId(),
			input: { conversationId: testConversationId(), prompt: 'Help' },
			model: 'test/model'
		});
		const fixture = agentContextFixture({ tools: () => tools });
		await fixture.builder.build(testActor(), request(), { provenanceId: testProvenanceId() }, [
			{ callId: 'call-approval', toolName: 'archive_note', arguments: {} }
		]);
		const archive = fixture.turns.inputs[0]?.tools.find((tool) => tool.name === 'archive_note') as
			FunctionTool | undefined;
		expect(await archive?.isEnabled({} as never, {} as never)).toBe(true);
	});

	it('keeps an undiscovered long-tail tool gated', async () => {
		const tools = createAgentTools({} as ControllerFactory, testActor(), {
			provenanceId: testProvenanceId(),
			input: { conversationId: testConversationId(), prompt: 'Help' },
			model: 'test/model'
		});
		const fixture = agentContextFixture({ tools: () => tools });
		await fixture.builder.build(testActor(), request(), { provenanceId: testProvenanceId() });
		const archive = fixture.turns.inputs[0]?.tools.find((tool) => tool.name === 'archive_note') as
			FunctionTool | undefined;
		expect(await archive?.isEnabled({} as never, {} as never)).toBe(false);
	});
});
