import { describe, expect, it } from 'vitest';
import { ConversationBuffer } from './buffer';

describe('ConversationBuffer', () => {
	it('is available as a domain service', () => {
		expect(ConversationBuffer).toBeTypeOf('function');
	});
});
