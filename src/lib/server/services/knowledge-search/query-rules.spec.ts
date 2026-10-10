import { describe, expect, it } from 'vitest';
import { SearchQueryRules } from './query-rules';

const rules = new SearchQueryRules();
describe('search query content rules', () => {
	it('preserves transcript whitespace and the exact condensation instructions', () => {
		expect(rules.prepare('  conversation\n')).toEqual({
			system:
				'Rewrite the following conversation into a single, focused search-query statement that captures what the user is currently trying to find or accomplish. Return only the statement — no preamble, no quotes.',
			user: '  conversation\n'
		});
	});
	it('only trims whitespace without stripping quotes or rewriting generated text', () => {
		expect(rules.complete({ raw: ' \n"deployment deadlines"  ' })).toBe('"deployment deadlines"');
	});
	it('rejects whitespace-only output', () => {
		expect(() => rules.complete({ raw: ' \n ' })).toThrow(
			'Search query generation returned no usable text'
		);
	});
});
