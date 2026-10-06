import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../../../../routes/layout.css';
import '$lib/components/edra/editor.css';
import WidgetTable from './widget-table.svelte';

/** A widget embedded in a note renders inside the editor's `.tiptap` root. */
const renderInNote = () => {
	const host = document.createElement('div');
	host.className = 'tiptap';
	host.style.setProperty('--note-header-h', '120px');
	document.body.append(host);
	// The outer `props` is the render option; the inner one is the element's own `props`.
	const screen = render(WidgetTable, {
		props: {
			props: {
				columns: [
					{ key: 'year', label: 'Year' },
					{ key: 'balance', label: 'Balance' }
				],
				rows: [
					{ year: 5, balance: 100 },
					{ year: 10, balance: 200 },
					{ year: 15, balance: 300 }
				]
			},
			emit: () => undefined,
			on: () => ({ emit: () => undefined, shouldPreventDefault: false, bound: false })
		}
	});
	host.append(screen.container);
	return screen.container;
};

describe('Widget table inside a note', () => {
	it('keeps its header on its own row', () => {
		const header = renderInNote().querySelector<HTMLElement>('th')!;

		const offset =
			header.getBoundingClientRect().top - header.closest('table')!.getBoundingClientRect().top;

		expect(offset).toBeLessThan(2);
	});

	it('leaves note tables their sticky header', () => {
		const host = document.createElement('div');
		host.className = 'tiptap';
		host.innerHTML = '<table><tbody><tr><th>Year</th></tr><tr><td>5</td></tr></tbody></table>';
		document.body.append(host);

		const position = getComputedStyle(host.querySelector('th')!).position;

		expect(position).toBe('sticky');
	});
});
