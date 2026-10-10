import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../../../routes/layout.css';
import * as Icon from './index';

const resolved = (color: string) => {
	const probe = document.createElement('span');
	probe.style.color = color;
	document.body.append(probe);
	const value = getComputedStyle(probe).color;
	probe.remove();
	return value;
};
const accentFill = (root: Element) => getComputedStyle(root.querySelector('.ft-accent')!).fill;

describe('icon accent', () => {
	it('stays ink at rest and lands in the brand colour under a live ancestor', async () => {
		const { container } = await render(Icon.Folder, { class: 'text-foreground' });
		const svg = container.querySelector('svg')!;
		expect(accentFill(container)).toBe(getComputedStyle(svg).color);

		container.setAttribute('aria-current', 'page');
		await expect.poll(() => accentFill(container)).toBe(resolved('var(--color-brand)'));
	});

	it('hides the glyph from assistive technology and passes classes through', async () => {
		const { container } = await render(Icon.Search, { class: 'size-4', 'aria-hidden': 'false' });
		const svg = container.querySelector('svg')!;
		expect(svg.getAttribute('aria-hidden')).toBe('true');
		expect(svg.classList.contains('size-4')).toBe(true);
	});
});

describe('sync icon', () => {
	it('draws each sync state differently', async () => {
		const states = ['synced', 'saving', 'downloading', 'offline', 'attention'] as const;
		const drawings = new Set<string>();
		for (const state of states) {
			const { container, unmount } = await render(Icon.Sync, { state });
			drawings.add(container.querySelector('svg')!.innerHTML);
			unmount();
		}
		expect(drawings.size).toBe(states.length);
	});

	it('moves the dot only while work is in progress', async () => {
		const motion = async (state: 'saving' | 'downloading' | 'synced') => {
			const { container, unmount } = await render(Icon.Sync, { state });
			const value = container.querySelector('svg')!.getAttribute('data-ft-motion');
			unmount();
			return value;
		};
		expect([await motion('saving'), await motion('downloading'), await motion('synced')]).toEqual([
			'rise',
			'fall',
			null
		]);
	});
});
