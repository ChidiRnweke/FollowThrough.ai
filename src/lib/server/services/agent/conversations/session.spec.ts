import { describe, expect, it } from 'vitest';
import { ConversationSession } from './session';

describe('ConversationSession', () => {
	it('is available as a domain service', () => {
		expect(ConversationSession).toBeTypeOf('function');
	});
});
