import { describe, expect, it } from 'vitest';
import type { ConversationId } from './index';
import { parseRunAgentInput, resolveAgentRunInput, submitAgentRunInputSchema } from './index';

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

	it('rejects a submission with an impossible client time zone', () => {
		expect(() =>
			submitAgentRunInputSchema.parse({
				requestId: '10000000-0000-4000-8000-000000000003',
				input: 'Hello',
				appContext: {
					version: 1,
					capturedAt: '2026-08-24T12:00:00.000Z',
					client: {
						locale: 'en-BE',
						timeZone: 'Mars/Olympus',
						localDate: '2026-08-24',
						layout: 'wide'
					},
					surface: { kind: 'today', presentation: 'full_page' },
					recentInteractions: []
				}
			})
		).toThrow('Client timeZone must be a valid IANA time zone');
	});
});
