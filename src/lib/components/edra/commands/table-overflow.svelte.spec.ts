import { afterEach, describe, expect, it } from 'vitest';
import { createEditor } from './editor';
import type { Editor } from './CoreEditor';
import { tableOverflowClass } from './table';
import '../editor.css';

const mounted: { element: HTMLElement; dispose: () => void }[] = [];

/** A one-row table in a host of `hostWidth` pixels, each column `columnWidth` pixels wide. */
const mount = (hostWidth: number, columns: number, columnWidth: number) => {
	const host = document.createElement('div');
	host.style.width = `${hostWidth}px`;
	document.body.appendChild(host);
	let created: Editor | undefined;
	const dispose = $effect.root(() => {
		created = createEditor({});
	});
	if (!created) throw new Error('Editor was not created');
	const editor = created;
	// The path `EditorContent.svelte` takes to move the editor into its host.
	const detached = editor.view.dom.parentNode;
	if (!detached) throw new Error('Editor was not rendered');
	host.append(...detached.childNodes);
	editor.setOptions({ element: host });
	editor.createNodeViews();
	editor.commands.setContent({
		type: 'doc',
		content: [
			{
				type: 'table',
				content: [
					{
						type: 'tableRow',
						content: Array.from({ length: columns }, (_, index) => ({
							type: 'tableHeader',
							attrs: { colwidth: [columnWidth] },
							content: [{ type: 'paragraph', content: [{ type: 'text', text: `Column ${index}` }] }]
						}))
					}
				]
			}
		]
	});
	mounted.push({ element: host, dispose });
	const wrapper = editor.view.dom.querySelector('.tableWrapper');
	if (!(wrapper instanceof HTMLElement)) throw new Error('Table wrapper was not rendered');
	return { host, wrapper };
};

const isOverflowing = (wrapper: HTMLElement) => () =>
	wrapper.classList.contains(tableOverflowClass);

afterEach(() => {
	for (const entry of mounted.splice(0)) {
		entry.dispose();
		entry.element.remove();
	}
});

describe('A note table wider than its pane', () => {
	it('scrolls horizontally instead of being cut off', async () => {
		const { wrapper } = mount(400, 8, 150);
		await expect.poll(() => getComputedStyle(wrapper).overflowX).toBe('auto');
	});

	it('stops scrolling once the pane grows wide enough to fit it', async () => {
		const { host, wrapper } = mount(400, 8, 150);
		await expect.poll(isOverflowing(wrapper)).toBe(true);
		host.style.width = '2000px';
		await expect.poll(isOverflowing(wrapper)).toBe(false);
	});
});

describe('A note table that fits its pane', () => {
	it('keeps its sticky header row', async () => {
		const { wrapper } = mount(1200, 2, 150);
		const header = wrapper.querySelector('th');
		if (!header) throw new Error('Header cell was not rendered');
		await expect.poll(() => getComputedStyle(header).position).toBe('sticky');
	});
});
