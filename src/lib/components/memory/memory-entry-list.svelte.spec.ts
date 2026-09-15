import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { memoryEntryBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { workspaceResourcesFixture } from '$lib/testing/sync/fixtures/workspace-resources';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { syncEtag } from '$lib/models/sync';
import MemoryEntryList from './memory-entry-list.svelte';

it('keeps the first memory action available while the initial inventory downloads', async () => {
	const memory = memoryEntryBuilder();
	const { resources, transport } = workspaceResourcesFixture(memory.userId);
	const key = workspaceResourceKey({ type: 'memory_entries', id: [memory.id] });
	transport.records.set(key, {
		etag: syncEtag(1n),
		value: { type: 'memory_entries', value: memory }
	});
	const paused = transport.pause('changes');
	const screen = render(MemoryEntryList, {
		workspace: resources,
		placeholder: 'Remember…',
		emptyText: 'No memory yet'
	});
	await paused.started;
	try {
		await expect
			.element(screen.getByRole('button', { name: 'Add memory', exact: true }))
			.toBeVisible();
	} finally {
		paused.release();
		resources.stop();
	}
});
