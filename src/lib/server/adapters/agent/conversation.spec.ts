import { describe, expect, it } from 'vitest';
import type { AgentInputItem } from '@openai/agents';
import type { ConversationId } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import {
	createConversationSession,
	createReplayVirtualizer
} from '$lib/server/factories/agent/conversation-factory';
import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
import { InMemoryAgentFiles } from '$lib/testing/agent/fakes/in-memory-agent-files';
import { userItem } from '$lib/testing/agent/session-items';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';

const actor: ActorContext = { userId: 'session-owner' as ActorContext['userId'] };
const conversationId = 'sdk-session' as ConversationId;
const first: AgentInputItem = { type: 'message', role: 'user', content: 'First' };
const second: AgentInputItem = { type: 'message', role: 'user', content: 'Second' };
const third: AgentInputItem = { type: 'message', role: 'user', content: 'Third' };

async function sessionWithHistory() {
	const repository = new InMemoryAgentSessionRepository();
	await repository.append(actor, conversationId, [userItem('First'), userItem('Second')]);
	const session = createConversationSession(
		repository,
		actor,
		conversationId,
		createReplayVirtualizer(new InMemoryAgentFiles(), testTokenizer)
	);
	return { session, repository };
}

describe('SDK conversation session', () => {
	it.each([
		{ limit: undefined, expected: [first, second] },
		{ limit: 1, expected: [second] },
		{ limit: 2, expected: [first, second] },
		{ limit: 3, expected: [first, second] },
		// Characterizes the existing slice(-limit) behavior; this refactor adds no limit policy.
		{ limit: 0, expected: [first, second] },
		{ limit: -1, expected: [second] }
	])('preserves ordering with limit $limit', async ({ limit, expected }) => {
		const { session } = await sessionWithHistory();
		expect(await session.getItems(limit)).toEqual(expected);
	});

	it('invalidates replay presentation after an SDK append without persisting the buffer', async () => {
		const { session, repository } = await sessionWithHistory();
		await session.getItems();
		await session.addItems([third]);
		expect({
			items: await session.getItems(),
			snapshot: await session.snapshot(),
			stored: (await repository.list(actor, conversationId)).map((row) => row.item)
		}).toEqual({
			items: [first, second, third],
			snapshot: [userItem('First'), userItem('Second'), userItem('Third')],
			stored: [userItem('First'), userItem('Second')]
		});
	});

	it('pops the last buffered item in SDK form and refreshes replay', async () => {
		const { session } = await sessionWithHistory();
		await session.getItems();
		const popped = await session.popItem();
		expect({ popped, items: await session.getItems(), snapshot: await session.snapshot() }).toEqual(
			{
				popped: second,
				items: [first],
				snapshot: [userItem('First')]
			}
		);
	});

	it('clears the buffer without deleting stored history or reloading it on an empty pop', async () => {
		const { session, repository } = await sessionWithHistory();
		await session.clearSession();
		expect({
			popped: await session.popItem(),
			items: await session.getItems(),
			snapshot: await session.snapshot(),
			stored: (await repository.list(actor, conversationId)).map((row) => row.item)
		}).toEqual({
			popped: undefined,
			items: [],
			snapshot: [],
			stored: [userItem('First'), userItem('Second')]
		});
	});

	it('keeps a valid SDK item outside the known domain arms lossless through replay and pop', async () => {
		const { session } = await sessionWithHistory();
		const system: AgentInputItem = { type: 'message', role: 'system', content: 'Provider context' };
		await session.addItems([system]);
		const items = await session.getItems(1);
		const snapshot = await session.snapshot();
		expect({ items, item: snapshot.at(-1), popped: await session.popItem() }).toEqual({
			items: [system],
			item: {
				type: 'unrecognised',
				raw: system,
				reason: "No arm matches a stored item of type 'message'"
			},
			popped: system
		});
	});
});
