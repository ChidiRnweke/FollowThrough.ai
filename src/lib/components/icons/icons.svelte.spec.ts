import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
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

	it('hides the glyph from assistive technology even when asked not to', async () => {
		const { container } = await render(Icon.Search, { class: 'size-4', 'aria-hidden': 'false' });
		const svg = container.querySelector('svg')!;
		expect(svg.getAttribute('aria-hidden')).toBe('true');
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

describe('theme icon', () => {
	const shownHalf = (root: Element) =>
		['light', 'dark'].filter(
			(half) => getComputedStyle(root.querySelector(`.ft-theme-${half}`)!).display !== 'none'
		);

	it('draws only the sun in light mode', async () => {
		const { container } = await render(Icon.Theme);
		expect(shownHalf(container)).toEqual(['light']);
	});

	it('draws only the moon under a dark ancestor', async () => {
		const { container } = await render(Icon.Theme);
		container.classList.add('dark');
		await expect.poll(() => shownHalf(container)).toEqual(['dark']);
	});
});

describe('icon motion on pointing', () => {
	const motion = (root: Element) => ({
		stroke: getComputedStyle(root.querySelector('.ft-stroke')!).animationName,
		dotIsInk: accentFill(root) === getComputedStyle(root.querySelector('svg')!).color
	});

	it('replays the trace with an ink dot when a control is hovered', async () => {
		const { container } = await render(Icon.Folder, { class: 'text-foreground' });
		container.setAttribute('role', 'button');
		await userEvent.hover(container);
		await expect.poll(() => motion(container)).toEqual({ stroke: 'ft-trace', dotIsInk: true });
	});

	it('keeps a rail control still when it is hovered', async () => {
		const { container } = await render(Icon.Folder, { class: 'text-foreground' });
		const rail = document.createElement('nav');
		rail.dataset.sidebar = 'icon-rail';
		container.replaceWith(rail);
		rail.append(container);
		container.setAttribute('role', 'button');
		await userEvent.hover(container);
		expect(motion(container)).toEqual({ stroke: 'none', dotIsInk: true });
	});
});
