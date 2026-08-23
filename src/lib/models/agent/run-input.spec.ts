import { describe, expect, it } from 'vitest';
import type { ConversationId } from './index';
import { parseRunAgentInput, resolveAgentRunInput } from './index';

const conversationId = '10000000-0000-4000-8000-000000000001' as ConversationId;

describe('agent run input', () => {
	it('resolves a staged first message with the conversation created by the server', () => {
		expect(resolveAgentRunInput({ prompt: 'Hello' }, conversationId).conversationId).toBe(
			conversationId
		);
	});

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
});
