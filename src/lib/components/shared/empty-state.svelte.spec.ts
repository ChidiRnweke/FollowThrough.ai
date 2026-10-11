import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import * as Icon from '$lib/components/icons';
import * as Scene from '$lib/components/icons/scenes';
import EmptyState from './empty-state.svelte';

describe('EmptyState', () => {
	it('gives a page-level region its drawn scene instead of a tinted tile', async () => {
		const { container } = await render(EmptyState, {
			size: 'large',
			scene: Scene.Trash,
			title: 'Trash is empty.',
			label: 'Empty trash'
		});
		const region = container.querySelector('section[aria-label="Empty trash"]');
		expect(region?.querySelector('[data-slot="scene"]')).not.toBeNull();
		expect(region?.querySelector('.bg-brand\\/10')).toBeNull();
	});

	it('keeps a plain icon in an inline slot', async () => {
		const { container } = await render(EmptyState, { icon: Icon.Pin, title: 'Pin a note.' });
		expect(container.querySelector('[data-slot="icon"]')).not.toBeNull();
		expect(container.querySelector('[data-slot="scene"]')).toBeNull();
	});
});
