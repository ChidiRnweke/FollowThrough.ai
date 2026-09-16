import { expect, it } from 'vitest';
import { ChatStore } from './chat.svelte';
import { InMemoryRunTransport } from '$lib/testing/agent/fakes/in-memory-run-transport';
import { InMemoryRunClientStorage } from '$lib/testing/agent/fakes/in-memory-run-client-storage';
import { testNoteId, testConversationId } from '$lib/testing/workspace/fixtures/domain-builders';
import type { AgentRunId } from '$lib/models/agent';

it('requests the selected skill by identity without selecting same-named skills', async () => {
	const transport = new InMemoryRunTransport({
		runId: '10000000-0000-4000-8000-000000000001' as AgentRunId,
		conversationId: testConversationId(),
		status: 'queued',
		latestCursor: '0'
	});
	const store = new ChatStore('mention-identity-test', transport, new InMemoryRunClientStorage());
	store.addChip({ kind: 'skill', id: testNoteId(7), name: 'Reviewer' });
	await store.send({ prompt: 'Review this' });
	const [request] = transport.requests.values();
	expect({ ids: request?.requestedSkillNoteIds, names: request?.requestedSkillNames }).toEqual({
		ids: [testNoteId(7)],
		names: undefined
	});
});
