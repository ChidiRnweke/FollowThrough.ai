import { describe, expect, it } from 'vitest';
import { rankHeadingTargets, type HeadingLinkTarget } from './HeadingLinkSuggestion';

const headings: HeadingLinkTarget[] = [
	{ id: 'a', level: 1, textContent: 'Design review' },
	{ id: 'b', level: 2, textContent: 'Fundamentals of design' },
	{ id: 'c', level: 2, textContent: 'Redesigned onboarding' },
	{ id: 'd', level: 3, textContent: 'Deployment runbook' }
];

const titles = (query: string) =>
	rankHeadingTargets(headings, query).map((heading) => heading.textContent);

describe('Ranking headings for a # query', () => {
	it('offers a heading that starts with the query first', () => {
		expect(titles('des')[0]).toBe('Design review');
	});

	/** A word-start match is what the author meant; a mid-word one rarely is. */
	it('ranks a word-start match above a mid-word one', () => {
		expect(titles('des')).toEqual([
			'Design review',
			'Fundamentals of design',
			'Redesigned onboarding'
		]);
	});

	it('breaks ties towards the shallower heading', () => {
		const nested: HeadingLinkTarget[] = [
			{ id: 'x', level: 3, textContent: 'Overview details' },
			{ id: 'y', level: 1, textContent: 'Overview' }
		];
		expect(rankHeadingTargets(nested, 'overview')[0]?.textContent).toBe('Overview');
	});

	it('ignores case', () => {
		expect(titles('DESIGN')[0]).toBe('Design review');
	});

	it('excludes headings that do not match at all', () => {
		expect(titles('des')).not.toContain('Deployment runbook');
	});

	it('offers everything for an empty query', () => {
		expect(rankHeadingTargets(headings, '')).toHaveLength(4);
	});

	it('returns nothing when nothing matches', () => {
		expect(titles('zzz')).toEqual([]);
	});

	/** A popup taller than the pane is worse than a truncated list. */
	it('caps how many it offers', () => {
		const many = Array.from({ length: 30 }, (_unused, index) => ({
			id: String(index),
			level: 2,
			textContent: `Section ${index}`
		}));
		expect(rankHeadingTargets(many, 'Section')).toHaveLength(8);
	});
});
