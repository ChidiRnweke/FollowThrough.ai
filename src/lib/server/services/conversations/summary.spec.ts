import { describe, expect, it } from 'vitest';
import { ConversationSummary } from './summary';

describe('ConversationSummary', () => {
	it('is available as a domain service', () => {
		expect(ConversationSummary).toBeTypeOf('function');
	});
});
