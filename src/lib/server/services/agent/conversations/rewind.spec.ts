import { describe, expect, it } from 'vitest';
import { ConversationHistoryService } from './history';
import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
const history = new ConversationHistoryService(new InMemoryAgentSessionRepository());
import {
	assistantItem as assistant,
	callItem,
	userItem as user
} from '$lib/testing/agent/session-items';

const toolCall = (name: string) => callItem(name, `call-${name}`);

describe('rewinding session memory to a user turn', () => {
	it('drops the named user turn and everything after it', () => {
		const items = [user('first'), assistant('answer'), user('second'), assistant('answer')];
		expect(history.rewind(items, 2)).toEqual([user('first'), assistant('answer')]);
	});

	it('empties the session when the first turn is rewound', () => {
		expect(history.rewind([user('first'), assistant('answer')], 1)).toEqual([]);
	});

	it('counts user items only, so tool activity does not shift the ordinal', () => {
		const items = [user('first'), toolCall('search'), assistant('answer'), user('second')];
		expect(history.rewind(items, 2)).toEqual([
			user('first'),
			toolCall('search'),
			assistant('answer')
		]);
	});

	it('reports nothing to do when the ordinal is past the last user turn', () => {
		expect(history.rewind([user('first')], 2)).toBeUndefined();
	});

	it('reports nothing to do for an ordinal below one', () => {
		expect(history.rewind([user('first')], 0)).toBeUndefined();
	});
});
