import { describe, expect, it } from 'vitest';
import { NoteDocumentPresentationService } from './document-presentation';
const presentation = new NoteDocumentPresentationService();

describe('Building the outline a note exposes', () => {
	it('has nothing to show for a note without headings', () => {
		expect(presentation.outline([])).toEqual([]);
	});

	it('keeps the headings in document order', () => {
		expect(
			presentation
				.outline([
					{ id: 'a', level: 1, textContent: 'Intro' },
					{ id: 'b', level: 2, textContent: 'Background' }
				])
				.map((heading) => heading.id)
		).toEqual(['a', 'b']);
	});

	it('drops a heading the author has not written yet', () => {
		expect(presentation.outline([{ id: 'a', level: 1, textContent: '   ' }])).toEqual([]);
	});

	it('drops a heading the extension has not stamped with an id', () => {
		expect(presentation.outline([{ id: null, level: 1, textContent: 'Intro' }])).toEqual([]);
	});

	it('trims the whitespace a heading picked up from its markup', () => {
		expect(presentation.outline([{ id: 'a', level: 1, textContent: '  Intro\n' }])[0].text).toBe(
			'Intro'
		);
	});

	it('clamps a level deeper than the heading ladder goes', () => {
		expect(presentation.outline([{ id: 'a', level: 9, textContent: 'Deep' }])[0].level).toBe(6);
	});
});

describe('Deciding which section the reader is in', () => {
	const offsets = [
		{ id: 'intro', top: 0 },
		{ id: 'method', top: 400 },
		{ id: 'results', top: 900 }
	];

	it('lights nothing when the note has no headings', () => {
		expect(presentation.activeHeading([], 120)).toBeUndefined();
	});

	it('lights the last heading the reader has scrolled past', () => {
		expect(presentation.activeHeading(offsets, 500)).toBe('method');
	});

	it('lights a heading the moment it reaches the line', () => {
		expect(presentation.activeHeading(offsets, 400)).toBe('method');
	});

	it('reads a preamble as part of the opening section', () => {
		expect(presentation.activeHeading([{ id: 'intro', top: 300 }], 0)).toBe('intro');
	});

	it('keeps the final heading lit at the bottom of the note', () => {
		expect(presentation.activeHeading(offsets, 5000)).toBe('results');
	});
});
