import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ProjectTree from './project-tree-view.fixture.svelte';
import { projectBuilder, noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';

it('does not call a partial project inventory empty', async () => {
	const screen = render(ProjectTree, { projects: [], notes: [], inventoryReady: false });
	await expect
		.element(screen.getByText('No projects yet. Create one to start.'))
		.not.toBeInTheDocument();
});

it('keeps downloaded notes navigable while inventory is incomplete', async () => {
	const screen = render(ProjectTree, {
		projects: [projectBuilder()],
		notes: [noteBuilder({ title: 'Downloaded note' })],
		inventoryReady: false
	});
	await expect
		.element(screen.getByRole('link', { name: 'Downloaded note', exact: true }))
		.toHaveAttribute('href', `/notes/${noteBuilder().id}`);
});

it('disables creation against an incomplete sibling list', async () => {
	const screen = render(ProjectTree, {
		projects: [projectBuilder()],
		notes: [],
		inventoryReady: false
	});
	await expect
		.element(screen.getByRole('button', { name: `Create in ${projectBuilder().name}` }))
		.toBeDisabled();
});
