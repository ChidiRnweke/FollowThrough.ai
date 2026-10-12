import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ProjectContextUsageSummary } from '$lib/models/context-usage';
import OverviewHero from './overview-hero.svelte';

const summary: ProjectContextUsageSummary = {
	mostUsed: [],
	neverUsed: [],
	chats: [],
	hiddenAttachments: [],
	missedSearches: [],
	activity: [],
	coverage: [
		{ kind: 'note', used: 3, total: 4 },
		{ kind: 'attachment', used: 0, total: 0 },
		{ kind: 'memory', used: 0, total: 0 }
	],
	unreadableCalls: 0
};

it('names the project in the sentence under the share it has had read', async () => {
	const screen = await render(OverviewHero, { summary, projectName: 'Platform', toFix: 0 });
	await expect.element(screen.getByText(/of Platform has been read: 3\s+of 4 notes/)).toBeVisible();
});
