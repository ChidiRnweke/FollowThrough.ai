import { describe, expect, it } from 'vitest';
import { rewindToUserItem, type SessionItem } from './agent-session-rewind';

const user = (text: string): SessionItem => ({ role: 'user', content: text });
const assistant = (text: string): SessionItem => ({ role: 'assistant', content: text });
const toolCall = (name: string): SessionItem => ({ type: 'function_call', name });

describe('rewinding session memory to a user turn', () => {
	it('drops the named user turn and everything after it', () => {
		const items = [user('first'), assistant('answer'), user('second'), assistant('answer')];
		expect(rewindToUserItem(items, 2)).toEqual([user('first'), assistant('answer')]);
	});

	it('empties the session when the first turn is rewound', () => {
		expect(rewindToUserItem([user('first'), assistant('answer')], 1)).toEqual([]);
	});

	it('counts user items only, so tool activity does not shift the ordinal', () => {
		const items = [user('first'), toolCall('search'), assistant('answer'), user('second')];
		expect(rewindToUserItem(items, 2)).toEqual([
			user('first'),
			toolCall('search'),
			assistant('answer')
		]);
	});

	it('reports nothing to do when the ordinal is past the last user turn', () => {
		expect(rewindToUserItem([user('first')], 2)).toBeUndefined();
	});

	it('reports nothing to do for an ordinal below one', () => {
		expect(rewindToUserItem([user('first')], 0)).toBeUndefined();
	});
});
