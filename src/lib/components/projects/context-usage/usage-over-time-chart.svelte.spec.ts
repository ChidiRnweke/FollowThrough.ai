import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { WeeklyReads } from '$lib/models/context-usage';
import type { DateTime } from '$lib/models/workspace';
import UsageOverTimeChart from './usage-over-time-chart.svelte';

const activity: WeeklyReads[] = [
	{
		weekStart: '2026-09-28T00:00:00.000Z' as DateTime,
		note: 9,
		attachment: 1,
		memory: 2,
		skill: 1
	},
	{ weekStart: '2026-10-05T00:00:00.000Z' as DateTime, note: 4, attachment: 2, memory: 1, skill: 1 }
];

it('splits the weeks by kind with a legend naming each kind', async () => {
	const screen = await render(UsageOverTimeChart, { activity });
	// Test pages carry no app stylesheet, so the chart has no height and its tooltip layer lies
	// over the toggle; click the element itself rather than whatever is at its position.
	(screen.getByRole('radio', { name: 'By kind' }).element() as HTMLElement).click();
	await expect.element(screen.getByText('Files', { exact: true })).toBeVisible();
});

it('states what the weeks add up to under the chart', async () => {
	const screen = await render(UsageOverTimeChart, { activity });
	await expect
		.element(
			screen.getByText(
				/Busiest week: Sep 28 \(13 reads\)\. This week: 8,\s+down 5 from last week\./
			)
		)
		.toBeVisible();
});
