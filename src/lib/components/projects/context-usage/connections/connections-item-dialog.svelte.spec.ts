import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ConnectionNode, ProjectConnectionsReport } from '$lib/models/context-usage';
import {
	testNoteId,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import ConnectionsItemDialog from './connections-item-dialog.svelte';

const brief: ConnectionNode = {
	key: `note:${testNoteId(1)}`,
	item: { kind: 'note', id: testNoteId(1), title: 'Brief' },
	use: { kind: 'read', times: 3, lastAt: testNow },
	chats: 3
};
const report: ProjectConnectionsReport = {
	nodes: [brief],
	together: [],
	links: [],
	chats: 3,
	memoryLeftOut: 0,
	mismatches: { linkedNeverTogether: [], togetherNotLinked: [] },
	ambient: [],
	defaultThreshold: 1
};

const plan: ConnectionNode = {
	key: `note:${testNoteId(2)}`,
	item: { kind: 'note', id: testNoteId(2), title: 'Plan' },
	use: { kind: 'never' },
	chats: 0
};

it('lists a partner linked both ways once per direction', async () => {
	const screen = await render(ConnectionsItemDialog, {
		report: {
			...report,
			nodes: [brief, plan],
			links: [
				{ from: brief.key, to: plan.key, kind: 'elaborates' },
				{ from: plan.key, to: brief.key, kind: 'elaborates' }
			]
		},
		projectId: testProjectId(),
		projectName: 'Launch',
		selected: brief,
		open: true,
		onselect: () => {},
		onask: () => {}
	});
	await expect.element(screen.getByText('elaborates (to this)')).toBeVisible();
});
