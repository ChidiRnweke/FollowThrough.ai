import { expect, it } from 'vitest';
import type { AgentRunId } from '$lib/models/agent';
import { ChatComposer } from './chat-composer';
import { ChatComposerState } from '$lib/stores/agent/chat-composer.svelte';
import { createChatFixture } from '$lib/testing/agent/chat-session';
import { InMemoryRunTransport } from '$lib/testing/agent/fakes/in-memory-run-transport';
import {
	InMemoryChatDraft,
	InMemoryChatSubmissionEnvironment
} from '$lib/testing/agent/fakes/in-memory-chat-draft';
import { ChatChipService } from '$lib/services/chat/chips';
import { agentContext } from '$lib/factories/agent/context';
import { agentSelectionContext } from '$lib/factories/agent/selection-context';
import {
	testConversationId,
	testNoteId,
	noteBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';
const fixture = () => {
	const transport = new InMemoryRunTransport({
		runId: '10000000-0000-4000-8000-000000000001' as AgentRunId,
		conversationId: testConversationId(),
		status: 'queued',
		latestCursor: '0'
	});
	const { chat } = createChatFixture(crypto.randomUUID(), transport);
	const storage = new InMemoryChatDraft();
	const environment = new InMemoryChatSubmissionEnvironment();
	return {
		chat,
		transport,
		storage,
		environment,
		composer: new ChatComposer(
			new ChatComposerState(),
			chat,
			agentContext,
			agentSelectionContext,
			new ChatChipService(),
			storage,
			environment
		)
	};
};
const request = {
	prompt: 'Explain this',
	selection: { noteId: testNoteId(), revision: 0, from: 0, to: 4, text: 'Some' }
};
it('restores a navigation handoff into the composer without sending it', () => {
	const { composer, storage, transport, chat } = fixture();
	storage.handoff = request;
	const { text } = composer.restore([noteBuilder()]);
	expect({ text, chips: chat.chips.length, sent: transport.requests.size }).toEqual({
		text: 'Explain this',
		chips: 1,
		sent: 0
	});
});
it('consumes a mounted-session handoff once without sending it', () => {
	const { composer, chat, transport } = fixture();
	chat.stage(request);
	composer.consumeStaged([noteBuilder()]);
	expect({
		next: composer.consumeStaged([noteBuilder()]),
		chips: chat.chips.length,
		sent: transport.requests.size
	}).toEqual({ next: undefined, chips: 1, sent: 0 });
});
it('keeps the draft when the stream budget prevents submission', () => {
	const { composer, storage, environment, transport } = fixture();
	storage.text = 'Keep me';
	environment.limited = true;
	composer.send({
		text: 'Keep me',
		images: [],
		noteTree: [],
		availability: 'complete',
		autoChip: undefined,
		focusedNoteId: undefined,
		activeProjectId: undefined,
		liveSelectionChip: undefined
	});
	expect({ draft: storage.text, sent: transport.requests.size }).toEqual({
		draft: 'Keep me',
		sent: 0
	});
});
it('preserves the pinned selection in the submitted request', async () => {
	const { composer, transport } = fixture();
	composer.prefill(request, [noteBuilder()]);
	const result = composer.send({
		text: 'Explain this',
		images: [],
		noteTree: [],
		availability: 'complete',
		autoChip: undefined,
		focusedNoteId: undefined,
		activeProjectId: undefined,
		liveSelectionChip: undefined
	});
	if (result.kind !== 'started') throw new Error(result.message);
	await result.completion;
	expect([...transport.requests.values()][0]?.selections).toEqual([request.selection]);
});
