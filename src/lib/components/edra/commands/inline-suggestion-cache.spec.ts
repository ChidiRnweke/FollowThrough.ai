import { describe, it, expect } from 'vitest';
import { InlineSuggestionCache } from './inline-suggestion-cache';

const at = (before: string, after = '') => ({ before, after });
const insert = (text: string) => ({ kind: 'insert' as const, text });

describe('InlineSuggestionCache', () => {
	it('recalls an offer at the spot it was made', () => {
		const cache = new InlineSuggestionCache();
		cache.remember(at('The plan '), insert('should work.'));
		expect(cache.recall(at('The plan '))).toEqual(insert('should work.'));
	});

	it('recalls the rest of an offer once its first letters are typed', () => {
		const cache = new InlineSuggestionCache();
		cache.remember(at('The plan '), insert('should work.'));
		expect(cache.recall(at('The plan sho'))).toEqual(insert('uld work.'));
	});

	it('recalls the whole offer again after those letters are deleted', () => {
		const cache = new InlineSuggestionCache();
		cache.remember(at('The plan '), insert('should work.'));
		cache.recall(at('The plan sho'));
		expect(cache.recall(at('The plan '))).toEqual(insert('should work.'));
	});

	it('forgets an offer when the text after the caret changed', () => {
		const cache = new InlineSuggestionCache();
		cache.remember(at('The plan '), insert('should work.'));
		expect(cache.recall(at('The plan ', ' Then the drill.'))).toBeUndefined();
	});

	it('forgets an offer once it has been typed out', () => {
		const cache = new InlineSuggestionCache();
		cache.remember(at('The plan '), insert('should work.'));
		const typedOut = cache.recall(at('The plan should work.'));
		expect([typedOut, cache.recall(at('The plan '))]).toEqual([undefined, undefined]);
	});

	it('forgets an offer the writer typed away from', () => {
		const cache = new InlineSuggestionCache();
		cache.remember(at('The plan '), insert('should work.'));
		const diverged = cache.recall(at('The plan sxx'));
		expect([diverged, cache.recall(at('The plan '))]).toEqual([undefined, undefined]);
	});

	it('prefers the newest offer when two were made at the same spot', () => {
		const cache = new InlineSuggestionCache();
		cache.remember(at('The plan '), insert('should work.'));
		cache.remember(at('The plan '), insert('must hold.'));
		expect(cache.recall(at('The plan '))).toEqual(insert('must hold.'));
	});
});
