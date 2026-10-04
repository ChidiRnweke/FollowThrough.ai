import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ProjectOverview from './project-overview.svelte';
import {
	noteBuilder,
	projectBuilder,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

const props = () => ({
	view: { project: projectBuilder(), tree: [] },
	counts: { todos: 0, memory: 0, artifacts: 0, diagrams: 0, widgets: 0, attachments: 0 },
	renderedAt: testNow,
	trashed: [
		{
			...noteBuilder({ title: 'Known trashed note' }),
			archivedAt: testNow,
			projectName: 'Project Alpha'
		}
	],
	trashInventoryReady: false
});
it('does not offer to empty project trash before its inventory is complete', async () => {
	const screen = await render(ProjectOverview, props());
	await screen.getByRole('button', { name: 'Trash · 1', exact: true }).click();
	await expect
		.element(screen.getByRole('button', { name: 'Empty trash', exact: true }))
		.not.toBeInTheDocument();
});
it('offers to empty project trash when its inventory is complete', async () => {
	const screen = await render(ProjectOverview, { ...props(), trashInventoryReady: true });
	await screen.getByRole('button', { name: 'Trash · 1', exact: true }).click();
	await expect
		.element(screen.getByRole('button', { name: 'Empty trash', exact: true }))
		.toBeVisible();
});
