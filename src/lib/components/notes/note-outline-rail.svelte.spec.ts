import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NoteOutlineRail from './note-outline-rail.svelte';
import type { OutlineHeading } from '$lib/models/notes';

const headings: readonly OutlineHeading[] = [
	{ id: 'intro', level: 1, text: 'Introduction' },
	{ id: 'background', level: 2, text: 'Background' },
	{ id: 'method', level: 1, text: 'Method' }
];

const noop = () => undefined;

describe('NoteOutlineRail', () => {
	it('stays out of the gutter for a note with a single heading', async () => {
		const screen = await render(NoteOutlineRail, {
			headings: [{ id: 'only', level: 1, text: 'Only' }],
			onpick: noop
		});
		expect(screen.container.querySelector('nav')).toBeNull();
	});

	it('draws one tick per heading', async () => {
		const screen = await render(NoteOutlineRail, { headings, onpick: noop });
		expect(screen.container.querySelectorAll('.note-outline-ticks li')).toHaveLength(3);
	});

	it('labels every heading in the expanded list', async () => {
		const screen = await render(NoteOutlineRail, { headings, onpick: noop });
		expect(
			[...screen.container.querySelectorAll('.note-outline-list button')].map((button) =>
				button.textContent?.trim()
			)
		).toEqual(['Introduction', 'Background', 'Method']);
	});

	it('marks the section the reader is in', async () => {
		const screen = await render(NoteOutlineRail, {
			headings,
			activeId: 'background',
			onpick: noop
		});
		expect(screen.container.querySelector('[aria-current="location"]')?.textContent?.trim()).toBe(
			'Background'
		);
	});

	it('numbers the headings when the document does', async () => {
		const screen = await render(NoteOutlineRail, { headings, numbered: true, onpick: noop });
		expect(
			[...screen.container.querySelectorAll('.note-outline-list button')].map(
				(button) => button.textContent?.trim().split(/\s+/)[0]
			)
		).toEqual(['1', '1.1', '2']);
	});

	it('leaves the headings unnumbered when the document is', async () => {
		const screen = await render(NoteOutlineRail, { headings, onpick: noop });
		expect(screen.container.querySelector('.note-outline-list button')?.textContent?.trim()).toBe(
			'Introduction'
		);
	});

	it('reports the heading the reader picked', async () => {
		let picked: string | undefined;
		const screen = await render(NoteOutlineRail, {
			headings,
			onpick: (id) => {
				picked = id;
			}
		});
		await screen.getByRole('button', { name: 'Method' }).click();
		expect(picked).toBe('method');
	});

	it('keeps one tab stop for the whole rail', async () => {
		const screen = await render(NoteOutlineRail, { headings, onpick: noop });
		expect(
			[...screen.container.querySelectorAll('.note-outline-list button')].filter(
				(button) => button.getAttribute('tabindex') === '0'
			)
		).toHaveLength(1);
	});
});
