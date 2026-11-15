import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../../../../routes/layout.css';
import type { ConversationId } from '$lib/models/agent';
import type { PendingMemoryNotification } from '$lib/models/memory';
import type {
	ScheduledAttention,
	ScheduledRunNotice,
	ScheduleOccurrenceId
} from '$lib/models/schedules';
import AttentionMenu from './attention-menu.svelte';

const pending = (count: number): PendingMemoryNotification => ({
	label: 'Research',
	href: '/memory?project=research',
	count
});
const notice = (suffix: number, title: string, line: string): ScheduledRunNotice => ({
	occurrenceId: `5d000000-0000-4000-8000-00000000000${suffix}` as ScheduleOccurrenceId,
	conversationId: `33000000-0000-4000-8000-00000000000${suffix}` as ConversationId,
	title,
	line,
	ranAt: 'Today, 08:00'
});
const quiet: ScheduledAttention = { waiting: [], finished: [], working: 0 };
const bellMotion = (root: Element) => getComputedStyle(root.querySelector('svg')!).animationName;

describe('the bell', () => {
	it('stays still for what a page loads with', async () => {
		const { container } = await render(AttentionMenu, {
			notifications: [pending(2)],
			scheduled: quiet
		});
		expect(bellMotion(container)).toBe('none');
	});

	it('swings once when a scheduled run finishes', async () => {
		const screen = await render(AttentionMenu, { notifications: [pending(2)], scheduled: quiet });
		await screen.rerender({
			notifications: [pending(2)],
			scheduled: { ...quiet, finished: [notice(1, 'Morning brief', 'Three things first.')] }
		});
		await expect.poll(() => bellMotion(screen.container)).toBe('ft-ring');
	});

	it('stays still when something is cleared', async () => {
		const screen = await render(AttentionMenu, { notifications: [pending(2)], scheduled: quiet });
		await screen.rerender({ notifications: [], scheduled: quiet });
		expect(bellMotion(screen.container)).toBe('none');
	});

	it('counts waiting runs, unopened runs and memory together, and lists them in that order', async () => {
		const screen = await render(AttentionMenu, {
			notifications: [pending(2)],
			scheduled: {
				waiting: [notice(1, 'Linear triage', 'Wants to make 2 changes. Waiting for you.')],
				finished: [notice(2, 'Morning brief', 'Three things first.')],
				working: 0
			}
		});
		await screen.getByRole('button', { name: '4 waiting for you' }).click();

		const menu = screen.getByRole('menu');
		await expect.element(menu).toBeVisible();
		expect(
			[...menu.element().querySelectorAll('[data-slot="dropdown-menu-label"]')].map((label) =>
				label.textContent?.trim()
			)
		).toEqual(['Waiting for you', 'Finished while you were away', 'Memory to review']);
	});
});
