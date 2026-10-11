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

const request = () => ({ conversationId: crypto.randomUUID() as ConversationId, prompt: 'Help' });

describe('Agent harness turns', () => {
	it('fails clearly when no model provider key is configured', async () => {
		const fixture = agentContextFixture({ agentAvailable: false });
		await expect(
			fixture.builder.build(testActor(), request(), { provenanceId: testProvenanceId() })
		).rejects.toThrow('OPENROUTER_API_KEY');
	});

	// The call a run parks on is in neither the transcript nor the session, so the run's own
	// pending decisions must keep the tool offered; otherwise resuming the approval of a
	// long-tail mutation reports the tool as missing.
	const missingToolReport = async (
		parked: Parameters<ReturnType<typeof agentContextFixture>['builder']['build']>[3]
	) => {
		const tools = createAgentTools({} as ControllerFactory, {
			provenanceId: testProvenanceId(),
			input: { conversationId: testConversationId(), prompt: 'Help' },
			model: 'test/model'
		});
		const fixture = agentContextFixture({ tools: () => tools });
		await fixture.builder.build(
			testActor(),
			request(),
			{ provenanceId: testProvenanceId() },
			parked
		);
		const formatter = fixture.turns.inputs[0]?.recovery.toolErrorFormatter;
		if (!formatter) throw new Error('The turn has no tool error formatter');
		return formatter({
			kind: 'tool_not_found',
			toolType: 'function',
			toolName: 'archive_note',
			callId: 'call-1',
			defaultMessage: "Tool 'archive_note' not found.",
			runContext: {} as never
		});
	};

	it('keeps the long-tail tool a parked run is about to answer for offered', async () => {
		const report = await missingToolReport([
			{ callId: 'call-approval', toolName: 'archive_note', arguments: {} }
		]);
		expect(report).not.toContain('has not been surfaced');
	});

	it('reports an undiscovered long-tail tool as needing discovery', async () => {
		const report = await missingToolReport([]);
		expect(report).toContain('has not been surfaced');
	});
});
