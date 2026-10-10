import { workspaceRebase } from '$lib/factories/workspace/rebase';
const rebaseWorkspaceRecord = workspaceRebase.rebase;
import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import { type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
const { workspaceResourceKey } = new WorkspaceCommandRulesService();
import { syncEtag } from '$lib/models/sync';
import { projectBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';
import {
	InMemoryOutbox,
	InMemoryAccountWriterLock
} from '$lib/testing/sync/fakes/in-memory-outbox';
import { createResourceCache } from '$lib/factories/sync/cache';
import { createMutationQueue } from '$lib/factories/sync/submission';
import { assembleWorkspaceResources } from '$lib/factories/workspace/resources';
import WorkspaceWriteReview from './workspace-write-review.svelte';

const setup = async (
	status: 'queued' | 'rejected' | 'conflict' = 'queued',
	remote: 'found' | 'deleted' = 'found'
) => {
	const project = projectBuilder({ name: 'My project' });
	const record: WorkspaceRecord = { type: 'projects', value: project };
	const identity: WorkspaceResourceIdentity = { type: 'projects', id: [project.id] };
	const key = workspaceResourceKey(identity);
	const repository = new InMemoryOutbox<WorkspaceCommand, WorkspaceRecord>(rebaseWorkspaceRecord);
	const cache = createResourceCache(project.userId, {
		repository: repository.projectedCache,
		transport: new InMemorySyncTransport<WorkspaceRecord>()
	});
	const { writes, execution } = createMutationQueue(project.userId, {
		repository,
		scheduler: new InMemorySyncScheduler(),
		writerLock: new InMemoryAccountWriterLock(),
		transport: {
			send: async () => {
				throw new Error('This review stays offline');
			}
		},
		pull: () => cache.refresh()
	});
	const resources = assembleWorkspaceResources(project.userId, {
		repository: repository,
		cache,
		writes,
		execution
	});
	await resources.initialize();
	resources.setOnline(false);
	const operationId = await repository.append(project.userId, {
		operationId: crypto.randomUUID(),
		key,
		command:
			status === 'queued'
				? { kind: 'createProject', id: project.id, name: project.name }
				: { kind: 'renameProject', projectId: project.id, name: project.name },
		base:
			status === 'queued'
				? null
				: {
						etag: syncEtag(1n),
						value: { type: 'projects', value: { ...project, name: 'Original' } }
					},
		basedOn: null,
		local: record,
		coalesce: null,
		references: []
	});
	if (status !== 'queued') {
		const sent = await repository.take(project.userId);
		if (!sent) throw new Error('The edit was not queued');
		await repository.settle(
			project.userId,
			sent,
			status === 'rejected'
				? { kind: 'rejected', message: 'The project is archived' }
				: {
						kind: 'conflict',
						remote:
							remote === 'deleted'
								? { kind: 'deleted', etag: syncEtag(2n) }
								: {
										kind: 'found',
										snapshot: {
											etag: syncEtag(2n),
											value: { type: 'projects', value: { ...project, name: 'Server project' } }
										}
									}
					}
		);
		await writes.reload();
	}
	await repository.read(project.userId);
	return { resources, project, identity, key, operationId };
};

it('discards an explicitly reviewed new local project', async () => {
	const { resources } = await setup();
	const screen = render(WorkspaceWriteReview, { resources, open: true });
	await screen.getByRole('button', { name: 'Review My project', exact: true }).click();
	await screen.getByRole('button', { name: 'Discard…', exact: true }).click();
	await screen.getByRole('button', { name: 'Discard change', exact: true }).click();
	await expect.element(screen.getByText('Everything is saved')).toBeVisible();
});

it('shows the server rejection while preserving the local edit', async () => {
	const { resources } = await setup('rejected');
	const screen = render(WorkspaceWriteReview, { resources, open: true });
	await screen.getByRole('button', { name: 'Review My project', exact: true }).click();
	await expect.element(screen.getByRole('alert')).toHaveTextContent('The project is archived');
});

it('compares the authoritative conflict value before keeping a change', async () => {
	const { resources } = await setup('conflict');
	const screen = render(WorkspaceWriteReview, { resources, open: true });
	await screen.getByRole('button', { name: 'Review My project', exact: true }).click();
	await expect
		.poll(async () => ({
			yours: document.querySelector('section[aria-label="Yours"]')?.textContent,
			latest: document.querySelector('section[aria-label="Latest"]')?.textContent
		}))
		.toMatchObject({
			yours: expect.stringContaining('My project'),
			latest: expect.stringContaining('Server project')
		});
});

it('refuses to discard dependent input added after review started', async () => {
	const { resources, project, identity } = await setup();
	const screen = render(WorkspaceWriteReview, { resources, open: true });
	await screen.getByRole('button', { name: 'Review My project', exact: true }).click();
	const draft = resources.draft(identity);
	await draft.read();
	await draft.stage({ kind: 'renameProject', projectId: project.id, name: 'Later edit' });
	await screen.getByRole('button', { name: 'Discard…', exact: true }).click();
	await screen.getByRole('button', { name: 'Discard change', exact: true }).click();
	await expect
		.element(screen.getByRole('alert'))
		.toHaveTextContent('Review dependent edits before discarding their base');
});

it('closes retained change details when the account session stops', async () => {
	const { resources } = await setup();
	const screen = render(WorkspaceWriteReview, { resources, open: true });
	await screen.getByRole('button', { name: 'Review My project', exact: true }).click();
	resources.stop();
	await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
});

it('offers no send action for an offline queued change', async () => {
	const { resources } = await setup();
	const screen = render(WorkspaceWriteReview, { resources, open: true });
	await screen.getByRole('button', { name: 'Review My project', exact: true }).click();
	await expect
		.element(screen.getByRole('button', { name: /Send now|Sync now/ }))
		.not.toBeInTheDocument();
});

it('cancels the destructive decision without changing saved intent', async () => {
	const { resources } = await setup();
	const screen = render(WorkspaceWriteReview, { resources, open: true });
	await screen.getByRole('button', { name: 'Review My project', exact: true }).click();
	await screen.getByRole('button', { name: /^Discard/ }).click();
	const beforeCancel = resources.pending.length;
	await screen.getByRole('button', { name: 'Cancel', exact: true }).click();
	expect({ beforeCancel, afterCancel: resources.pending.length }).toEqual({
		beforeCancel: 1,
		afterCancel: 1
	});
});
