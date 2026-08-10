import { beforeEach, describe, expect, it } from 'vitest';
import { rightPanel } from '$lib/stores/shell/right-panel.svelte';
import { commandRegistry } from './registry';

const globalSearch = commandRegistry.find((command) => command.id === 'global-search');
if (!globalSearch) throw new Error('global-search command is not registered');

beforeEach(() => {
	rightPanel.close();
});

describe('The global-search command', () => {
	it('opens the search panel', async () => {
		await globalSearch.run();
		expect(rightPanel.mode).toBe('search');
	});

	it('focuses the search input once the panel mounts', async () => {
		const focused: boolean[] = [];
		const unregister = rightPanel.registerSearchInputFocus(() => focused.push(true));
		await globalSearch.run();
		unregister();
		expect(focused).toHaveLength(1);
	});

	it('refocuses an already-open search instead of closing it', async () => {
		rightPanel.openSearch();
		const focused: boolean[] = [];
		const unregister = rightPanel.registerSearchInputFocus(() => focused.push(true));
		await globalSearch.run();
		unregister();
		expect(rightPanel.mode).toBe('search');
	});
});
