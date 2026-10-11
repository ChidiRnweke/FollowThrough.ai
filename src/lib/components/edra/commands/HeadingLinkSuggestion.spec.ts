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
			{ id: 'x', level: 3, textContent: 'Alpha notes' },
			{ id: 'y', level: 1, textContent: 'Alpha plan' }
		];
		expect(rankHeadingTargets(nested, 'alpha')[0]?.textContent).toBe('Alpha plan');
	});
});
