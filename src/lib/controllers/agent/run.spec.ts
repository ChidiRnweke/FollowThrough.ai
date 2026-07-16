import { describe, expect, it } from 'vitest';
import type { AgentEvent, ConversationId } from '$lib/models';
import { PersistentConversationJournal } from '$lib/services';
import { InMemoryAgentRunner } from '$lib/testing/fakes/in-memory-agent';
import { InMemoryConversationRepository } from '$lib/testing/fakes/in-memory-conversations';
import { InMemoryProvenanceRecorder } from '$lib/testing/fakes/in-memory-pipelines';
import { testActor } from '$lib/testing/fixtures/domain-builders';
import { DefaultAgentController } from './controller';

const collect = async (events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> => {
	const collected: AgentEvent[] = [];
	for await (const event of events) collected.push(event);
	return collected;
};

const setup = (events: AgentEvent[]) => {
	const repository = new InMemoryConversationRepository();
	const runner = new InMemoryAgentRunner();
	runner.events = events;
	const journal = new PersistentConversationJournal(repository);
	const controller = new DefaultAgentController({
		contextBuilder: { build: async () => ({}) },
		agentRunner: runner,
		conversationJournal: journal,
		provenanceRecorder: new InMemoryProvenanceRecorder(),
		preferences: {
			get: async (actor) => ({
				userId: actor.userId,
				executionMode: 'approval_required',
				createdAt: '2026-01-01T00:00:00.000Z' as never,
				updatedAt: '2026-01-01T00:00:00.000Z' as never
			}),
			update: async () => {
				throw new Error('Unexpected preferences update');
			}
		},
		models: {
			list: async () => [],
			assertSelectable: async () => undefined
		},
		runStore: {
			create: async () => {
				throw new Error('Unexpected run creation');
			},
			get: async () => {
				throw new Error('Unexpected run load');
			},
			pause: async () => {
				throw new Error('Unexpected run pause');
			},
			complete: async () => {
				throw new Error('Unexpected run completion');
			},
			fail: async () => {
				throw new Error('Unexpected run failure');
			},
			cancel: async () => {
				throw new Error('Unexpected run cancellation');
			}
		},
		defaultModel: 'openai/test-model'
	});
	return { controller, repository };
};

describe('Agent conversation invariants', () => {
	it('returns the persisted conversation identifier on completion', async () => {
		const { controller, repository } = setup([
			{ type: 'completed', conversationId: 'discarded' as ConversationId }
		]);
		const events = await collect(controller.run(testActor(), { prompt: 'Help me decide' }));
		expect(events.at(-1)).toEqual({
			type: 'completed',
			conversationId: repository.conversations[0]?.id,
			model: 'openai/test-model'
		});
	});

	it('persists the user prompt before running the agent', async () => {
		const { controller, repository } = setup([
			{ type: 'completed', conversationId: 'discarded' as ConversationId }
		]);
		await collect(controller.run(testActor(), { prompt: 'Compare the options' }));
		expect(repository.messages[0]?.content).toEqual({
			type: 'text',
			text: 'Compare the options'
		});
	});

	it('persists streamed assistant text as one message', async () => {
		const { controller, repository } = setup([
			{ type: 'text_delta', text: 'First ' },
			{ type: 'text_delta', text: 'answer' },
			{ type: 'completed', conversationId: 'discarded' as ConversationId }
		]);
		await collect(controller.run(testActor(), { prompt: 'Help' }));
		expect(repository.messages.at(-1)?.content).toEqual({ type: 'text', text: 'First answer' });
	});

	it('persists tool lifecycle activity', async () => {
		const { controller, repository } = setup([
			{ type: 'tool_started', callId: 'call-1', name: 'knowledge_search', arguments: {} },
			{ type: 'tool_completed', callId: 'call-1', name: 'knowledge_search' },
			{ type: 'completed', conversationId: 'discarded' as ConversationId }
		]);
		await collect(controller.run(testActor(), { prompt: 'Search' }));
		expect(repository.messages.filter((message) => message.role === 'tool')).toHaveLength(2);
	});

	it('continues an owned conversation without creating another', async () => {
		const { controller, repository } = setup([
			{ type: 'completed', conversationId: 'discarded' as ConversationId }
		]);
		const first = await collect(controller.run(testActor(), { prompt: 'First' }));
		const conversationId = (first.at(-1) as Extract<AgentEvent, { type: 'completed' }>)
			.conversationId;
		await collect(controller.run(testActor(), { conversationId, prompt: 'Second' }));
		expect(repository.conversations).toHaveLength(1);
	});

	it('rejects another user’s conversation identifier', async () => {
		const { controller } = setup([
			{ type: 'completed', conversationId: 'discarded' as ConversationId }
		]);
		const first = await collect(controller.run(testActor(), { prompt: 'First' }));
		const conversationId = (first.at(-1) as Extract<AgentEvent, { type: 'completed' }>)
			.conversationId;
		await expect(
			collect(controller.run(testActor(2), { conversationId, prompt: 'Intrude' }))
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('lists the actor’s conversation sessions', async () => {
		const { controller } = setup([
			{ type: 'completed', conversationId: 'discarded' as ConversationId }
		]);
		await collect(controller.run(testActor(), { prompt: 'First' }));
		const sessions = await controller.listSessions(testActor());
		expect(sessions.map((session) => session.title)).toEqual(['First']);
	});

	it('loads a session with its persisted messages', async () => {
		const { controller } = setup([
			{ type: 'text_delta', text: 'Answer' },
			{ type: 'completed', conversationId: 'discarded' as ConversationId }
		]);
		const events = await collect(controller.run(testActor(), { prompt: 'Question' }));
		const conversationId = (events.at(-1) as Extract<AgentEvent, { type: 'completed' }>)
			.conversationId;
		const session = await controller.getSession(testActor(), conversationId);
		expect(session.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
	});
});
