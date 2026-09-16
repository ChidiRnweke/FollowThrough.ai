import { describe, expect, it } from 'vitest';
import type { ConversationId } from '$lib/models/agent';
import { parseRunAgentInput, parseAgentRunContextSnapshot } from './stored-values';

const conversationId = '10000000-0000-4000-8000-000000000001' as ConversationId;

describe('stored agent run snapshots', () => {
	it('rejects a persisted snapshot without a conversation id', () => {
		expect(() => parseRunAgentInput({ prompt: 'Hello' }, conversationId)).toThrow();
	});

	it('rejects a snapshot copied from a different conversation', () => {
		expect(() =>
			parseRunAgentInput(
				{
					prompt: 'Hello',
					conversationId: '10000000-0000-4000-8000-000000000002'
				},
				conversationId
			)
		).toThrow('Run input conversation does not match its persisted run');
	});

	it('keeps an empty context snapshot unprepared', () => {
		expect(parseAgentRunContextSnapshot({})).toBeUndefined();
	});

	it('rejects a damaged context instead of treating it as unprepared', () => {
		expect(() => parseAgentRunContextSnapshot({ contextNotes: 'lost' })).toThrow();
	});
});
