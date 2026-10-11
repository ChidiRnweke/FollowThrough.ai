import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { memoryEntryBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { workspaceFixture } from '$lib/testing/workspace/fixtures/workspace';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
const { workspaceResourceKey } = new WorkspaceCommandRulesService();
import { syncEtag } from '$lib/models/sync';
import MemoryEntryList from './memory-entry-list.svelte';

it('keeps the first memory action available while the initial inventory downloads', async () => {
	const memory = memoryEntryBuilder();
	const fixture = workspaceFixture({ accountId: memory.userId });
	await fixture.start();
	const transport = fixture.transport.reads;
	const key = workspaceResourceKey({ type: 'memory_entries', id: [memory.id] });
	transport.records.set(key, {
		etag: syncEtag(1n),
		value: { type: 'memory_entries', value: memory }
	});
	const paused = transport.pause('changes');
	const screen = render(MemoryEntryList, {
		graph: { workspace: fixture.workspace, views: fixture.views },
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
		fixture.workspace.stop();
	}
});
