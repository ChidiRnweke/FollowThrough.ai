import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import type { WorkspaceResourcesController } from '$lib/controllers/workspace/resources';
import { expect, it } from 'vitest';
import { error } from '@sveltejs/kit';
import type { AgentRunId } from '$lib/models/agent';
import { createChatFixture } from '$lib/testing/agent/chat-session';
import { InMemoryDelayedChatTransport } from '$lib/testing/agent/fakes/in-memory-delayed-chat';
import { chatRunSnapshot } from '$lib/testing/agent/fixtures/run-snapshot';
import { testConversationId } from '$lib/testing/workspace/fixtures/domain-builders';
const receipt = {
	runId: '10000000-0000-4000-8000-000000000001' as AgentRunId,
	conversationId: testConversationId(),
	status: 'queued' as const,
	latestCursor: '0'
};
const fixture = () => {
	const transport = new InMemoryDelayedChatTransport(receipt);
	return { ...createChatFixture(crypto.randomUUID(), transport), transport };
};
it('does not attach a submitted run after its final session holder releases it', async () => {
	const { chat, transport } = fixture();
	const pending = chat.send({ prompt: 'Hello' });
	chat.release();
	transport.submission.resolve(receipt);
	await pending;
	expect({ conversation: chat.conversationId, connection: chat.connection }).toEqual({
		conversation: undefined,
		connection: 'detached'
	});
});
it('does not publish a submission failure after release', async () => {
	const { chat, transport } = fixture();
	const pending = chat.send({ prompt: 'Hello' });
	chat.release();
	transport.submission.reject(new Error('offline'));
	await pending;
	expect({ error: chat.entries.at(-1)?.error, connection: chat.connection }).toEqual({
		error: undefined,
		connection: 'detached'
	});
});
it('does not restore a disconnected session after a failed late reconciliation', async () => {
	const { chat, transport } = fixture();
	transport.deferSubmit = false;
	await chat.send({ prompt: 'Hello' });
	transport.disconnect();
	chat.release();
	transport.reconciliation.reject(new Error('offline'));
	await Promise.resolve();
	await Promise.resolve();
	expect(chat.connection).toBe('detached');
});
it('does not apply a late approval decision to a released session', async () => {
	const { chat, state, transport } = fixture();
	state.runId = receipt.runId;
	state.runStatus = 'awaiting_approval';
	state.entries = [
		{
			id: 'reply',
			role: 'assistant',
			status: 'awaiting_approval',
			suggestions: [],
			parts: [
				{
					kind: 'tool',
					tool: {
						name: 'find_references',
						callId: 'call',
						runId: receipt.runId,
						status: 'approval_required',
						arguments: { query: 'x' }
					}
				}
			]
		}
	];
	const reply = chat.entries[0]!;
	const tool = reply.parts[0]!;
	if (tool.kind !== 'tool') throw new Error('Expected approval');
	const pending = chat.decide(reply, tool.tool, 'approve');
	chat.release();
	transport.decision.resolve(chatRunSnapshot(receipt.runId, receipt.conversationId, 'queued'));
	await pending;
	expect(reply.parts[0]).toMatchObject({ kind: 'tool', tool: { status: 'approval_required' } });
});
it('reports an explicit server rejection without calling it an uncertain submission', async () => {
	const { chat, transport } = fixture();
	const pending = chat.send({ prompt: 'Hello' });
	try {
		error(409, 'This conversation is already running.');
	} catch (failure) {
		transport.submission.reject(failure);
	}
	await pending;
	expect(chat.entries.at(-1)?.error).toBe('This conversation is already running.');
});

it('does not attach a submitted run after its workspace account stops', async () => {
	const { chat, state, transport } = fixture();
	let active = true;
	state.resources = capabilityDependencies<WorkspaceResourcesController>({
		get active() {
			return active;
		},
		online: true
	});
	const pending = chat.send({ prompt: 'Hello' });
	active = false;
	transport.submission.resolve(receipt);
	await pending;
	expect({ conversation: chat.conversationId, connection: chat.connection }).toEqual({
		conversation: undefined,
		connection: 'detached'
	});
});
