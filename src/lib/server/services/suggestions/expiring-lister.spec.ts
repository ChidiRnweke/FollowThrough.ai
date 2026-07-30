import { describe, expect, it } from 'vitest';
import { ExpiringSuggestionLister } from './expiring-lister';

describe('ExpiringSuggestionLister', () => {
	it('is available as a domain service', () => {
		expect(ExpiringSuggestionLister).toBeTypeOf('function');
	});
});
