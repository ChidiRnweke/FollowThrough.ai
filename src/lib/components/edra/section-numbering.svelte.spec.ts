import { afterEach, describe, expect, it } from 'vitest';
import './editor.css';

/** The numbers the counters print, read the way a reader sees them. */
const numbersOf = (root: HTMLElement): string[] =>
	[...root.querySelectorAll('h1, h2, h3, h4')].map(
		(heading) => getComputedStyle(heading, '::before').content
	);

/** The CSS separates a number from its heading with an en space (U+2002). */
const gap = '\u2002';

const mount = (body: string): HTMLElement => {
	const wrapper = document.createElement('div');
	wrapper.className = 'note-section-numbering';
	wrapper.innerHTML = `<div class="tiptap">${body}</div>`;
	document.body.append(wrapper);
	return wrapper;
};

afterEach(() => document.body.replaceChildren());

describe('section numbering', () => {
	it('numbers a note that opens at H2 from 1, as sectionNumbersFor defines', () => {
		const note = mount('<h2>Before launch</h2><h3>Freeze</h3><h2>Launch day</h2>');
		expect(numbersOf(note)).toEqual([
			`counter(note-h2) "${gap}"`,
			`counter(note-h2) "." counter(note-h3) "${gap}"`,
			`counter(note-h2) "${gap}"`
		]);
	});

	it('keeps the full number under an H1', () => {
		const note = mount('<h1>Plan</h1><h2>Scope</h2>');
		expect(numbersOf(note)).toEqual([
			`counter(note-h1) ".${gap}"`,
			`counter(note-h1) "." counter(note-h2) "${gap}"`
		]);
	});

	it('neither numbers nor counts the headings inside an embedded widget', () => {
		const note = mount(
			'<h1>Plan</h1><div data-widget-node="w1"><h2>Stage durations</h2></div><h2>Risks</h2>'
		);
		const widgetHeading = note.querySelector('[data-widget-node] h2');
		const noteHeading = note.querySelector('.tiptap > h2');
		if (!widgetHeading || !noteHeading) throw new Error('The fixture is missing a heading');
		expect({
			widgetNumber: getComputedStyle(widgetHeading, '::before').content,
			widgetCounts: getComputedStyle(widgetHeading).counterIncrement,
			noteCounts: getComputedStyle(noteHeading).counterIncrement
		}).toEqual({ widgetNumber: 'none', widgetCounts: 'none', noteCounts: 'note-h2 1' });
	});
});
