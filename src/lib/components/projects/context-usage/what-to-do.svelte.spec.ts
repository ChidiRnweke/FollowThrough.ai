import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ProjectContextUsageSummary } from '$lib/models/context-usage';
import { testNoteId, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
import WhatToDo from './what-to-do.svelte';

const summary: ProjectContextUsageSummary = {
	mostUsed: [],
	neverUsed: [
		{ kind: 'note', id: testNoteId(1), title: 'Old plan' },
		{ kind: 'note', id: testNoteId(2), title: 'Press list' }
	],
	chats: [],
	hiddenAttachments: [],
	missedSearches: [],
	activity: [],
	coverage: [],
	unreadableCalls: 0
};

it('lists the items the agent never read when asked to review them', async () => {
	const screen = await render(WhatToDo, { summary, projectId: testProjectId(), count: 1 });
	await screen.getByRole('button', { name: 'Review' }).click();
	await expect.element(screen.getByRole('link', { name: 'Press list' })).toBeVisible();
});
