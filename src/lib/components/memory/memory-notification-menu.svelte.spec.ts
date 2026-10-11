import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../../../routes/layout.css';
import type { PendingMemoryNotification } from '$lib/models/memory';
import MemoryNotificationMenu from './memory-notification-menu.svelte';

const pending = (count: number): PendingMemoryNotification => ({
	label: 'Research',
	href: '/memory?project=research',
	count
});
const bellMotion = (root: Element) => getComputedStyle(root.querySelector('svg')!).animationName;

describe('memory notification bell', () => {
	it('stays still for the suggestions a page loads with', async () => {
		const { container } = await render(MemoryNotificationMenu, { notifications: [pending(2)] });
		expect(bellMotion(container)).toBe('none');
	});

	it('swings once when a new suggestion arrives', async () => {
		const screen = await render(MemoryNotificationMenu, { notifications: [pending(2)] });
		await screen.rerender({ notifications: [pending(3)] });
		await expect.poll(() => bellMotion(screen.container)).toBe('ft-ring');
	});

	it('stays still when suggestions are cleared', async () => {
		const screen = await render(MemoryNotificationMenu, { notifications: [pending(2)] });
		await screen.rerender({ notifications: [] });
		expect(bellMotion(screen.container)).toBe('none');
	});
});
