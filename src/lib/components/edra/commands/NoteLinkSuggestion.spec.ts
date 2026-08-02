import { describe, expect, it } from 'vitest';
import { rankNoteLinkTargets } from './NoteLinkSuggestion';

const notes = [
	{ id: 'a', title: 'Design review' },
	{ id: 'b', title: 'Fundamentals of design' },
	{ id: 'c', title: 'Redesigned onboarding' },
	{ id: 'd', title: 'Deployment runbook' }
];

const titles = (query: string) => rankNoteLinkTargets(notes, query).map((note) => note.title);

describe('Ranking notes for an @ query', () => {
	it('offers a title that starts with the query first', () => {
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

	it('ignores case', () => {
		expect(titles('DESIGN')[0]).toBe('Design review');
	});

	it('excludes titles that do not match at all', () => {
		expect(titles('des')).not.toContain('Deployment runbook');
	});

	it('offers everything for an empty query', () => {
		expect(rankNoteLinkTargets(notes, '')).toHaveLength(4);
	});

	it('ignores surrounding whitespace in the query', () => {
		expect(titles('  design  ')[0]).toBe('Design review');
	});

	it('returns nothing when nothing matches', () => {
		expect(titles('zzz')).toEqual([]);
	});

	/** A popup taller than the pane is worse than a truncated list. */
	it('caps how many it offers', () => {
		const many = Array.from({ length: 30 }, (_unused, index) => ({
			id: String(index),
			title: `Note ${index}`
		}));
		expect(rankNoteLinkTargets(many, 'Note')).toHaveLength(8);
	});
});
