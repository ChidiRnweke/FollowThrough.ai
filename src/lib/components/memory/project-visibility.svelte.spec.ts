import { afterEach, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	projectBuilder,
	memoryEntryBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';
import { workspaceResourcesFixture } from '$lib/testing/sync/fixtures/workspace-resources';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { syncEtag } from '$lib/models/sync';
import MemoryEntryList from './memory-entry-list.svelte';

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const stop of cleanup.splice(0)) stop();
});
const setup = async () => {
	const project = projectBuilder();
	const memory = memoryEntryBuilder({ projectId: project.id });
	const { resources, cache } = workspaceResourcesFixture(project.userId);
	cleanup.push(() => resources.stop());
	await cache.accept(workspaceResourceKey({ type: 'projects', id: [project.id] }), {
		etag: syncEtag(1n),
		value: { type: 'projects', value: project }
	});
	await cache.accept(workspaceResourceKey({ type: 'memory_entries', id: [memory.id] }), {
		etag: syncEtag(2n),
		value: { type: 'memory_entries', value: memory }
	});
	await resources.initialize();
	resources.setOnline(false);
	const screen = render(MemoryEntryList, {
		workspace: resources,
		projectId: project.id,
		placeholder: 'Remember…',
		emptyText: 'No memory yet'
	});
	const archive = async () => {
		const draft = resources.draft({ type: 'projects', id: [project.id] });
		await draft.read();
		const result = await draft.stage({ kind: 'archiveProject', projectId: project.id });
		if (result.kind === 'failure') throw new Error(result.message);
	};
	return { screen, archive, memory };
};
it('keeps saved memory visible while its project is active', async () => {
	const { screen, memory } = await setup();
	await expect.element(screen.getByText(memory.content, { exact: true })).toBeVisible();
});
it('replaces archived project memory with an unavailable state', async () => {
	const { screen, archive } = await setup();
	await archive();
	await expect
		.element(screen.getByText('This project is no longer available.', { exact: true }))
		.toBeVisible();
});
it('hides retained memory after its project is archived', async () => {
	const { screen, archive, memory } = await setup();
	await archive();
	await expect.element(screen.getByText(memory.content, { exact: true })).not.toBeInTheDocument();
});
it('removes the add action after its project is archived', async () => {
	const { screen, archive } = await setup();
	await archive();
	await expect
		.element(screen.getByRole('button', { name: 'Add memory', exact: true }))
		.not.toBeInTheDocument();
});
it('closes an open memory composer when its project is archived', async () => {
	const { screen, archive } = await setup();
	await screen.getByRole('button', { name: 'Add memory', exact: true }).click();
	await archive();
	await expect
		.element(screen.getByRole('dialog', { name: 'Add a memory' }))
		.not.toBeInTheDocument();
});

it('closes a pending deletion when its project is archived', async () => {
	const { screen, archive } = await setup();
	await screen.getByRole('button', { name: 'Memory actions' }).click();
	await screen.getByRole('menuitem', { name: 'Delete' }).click();
	await archive();
	await expect.element(screen.getByRole('alertdialog')).not.toBeInTheDocument();
});

it('withholds project memory actions until its project is downloaded', async () => {
	const project = projectBuilder();
	const { resources, transport } = workspaceResourcesFixture(project.userId);
	cleanup.push(() => resources.stop());
	const paused = transport.pause('changes');
	const screen = render(MemoryEntryList, {
		workspace: resources,
		projectId: project.id,
		placeholder: 'Remember…',
		emptyText: 'No memory yet'
	});
	await paused.started;
	try {
		await expect
			.element(screen.getByRole('button', { name: 'Add memory', exact: true }))
			.not.toBeInTheDocument();
	} finally {
		paused.release();
	}
});
