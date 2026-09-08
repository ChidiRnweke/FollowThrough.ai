import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import { workspaceResourceKey, type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import { syncEtag } from '$lib/models/sync';
import { projectBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemorySyncCache, InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';
import {
	InMemoryOutbox,
	InMemoryAccountWriterLock
} from '$lib/testing/sync/fakes/in-memory-outbox';
import { ResourceCache } from '$lib/client/sync/resource-cache';
import { MutationQueue } from '$lib/client/sync/mutation-queue';
import { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';
import WorkspaceWriteReview from './workspace-write-review.svelte';

const setup = async (status: 'queued' | 'rejected' | 'conflict' = 'queued') => {
	const project = projectBuilder({ name: 'My project' });
	const record: WorkspaceRecord = { type: 'projects', value: project };
	const identity: WorkspaceResourceIdentity = { type: 'projects', id: [project.id] };
	const key = workspaceResourceKey(identity);
	const repository = new InMemoryOutbox<WorkspaceCommand, WorkspaceRecord>();
	const cache = new ResourceCache(project.userId, {
		repository: new InMemorySyncCache<WorkspaceRecord>(),
		transport: new InMemorySyncTransport<WorkspaceRecord>()
	});
	const writes = new MutationQueue(project.userId, {
		repository,
		writerLock: new InMemoryAccountWriterLock(),
		transport: {
			send: async () => {
				throw new Error('This review stays offline');
			}
		},
		resolveBase: async () => {
			throw new Error('No imported draft');
		},
		received: async (key, resource) =>
			cache.accept(key, resource.kind === 'found' ? resource.snapshot : resource)
	});
	const resources = new WorkspaceResources(project.userId, {
		cache,
		writes,
		restoreLocalWrites: async () => undefined
	});
	resources.setOnline(false);
	const operationId = await resources.append({
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
						remote: {
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
	return { resources, project, identity, key, operationId };
};

it('discards an explicitly reviewed new local project', async () => {
	const { resources } = await setup();
	const screen = render(WorkspaceWriteReview, { resources, open: true });
	await screen.getByRole('button', { name: 'Review', exact: true }).click();
	await screen.getByRole('button', { name: 'Discard local change' }).click();
	await expect.element(screen.getByText('No changes are waiting to send.')).toBeVisible();
});

it('shows the server rejection while preserving the local edit', async () => {
	const { resources } = await setup('rejected');
	const screen = render(WorkspaceWriteReview, { resources, open: true });
	await screen.getByRole('button', { name: 'Review', exact: true }).click();
	await expect.element(screen.getByRole('alert')).toHaveTextContent('The project is archived');
});

it('compares the authoritative conflict value before keeping a change', async () => {
	const { resources } = await setup('conflict');
	const screen = render(WorkspaceWriteReview, { resources, open: true });
	await screen.getByRole('button', { name: 'Review', exact: true }).click();
	await expect
		.element(screen.getByRole('region', { name: 'Server copy' }))
		.toHaveTextContent('Server project');
});

it('refuses to discard dependent input added after review started', async () => {
	const { resources, project, key, identity, operationId } = await setup();
	const screen = render(WorkspaceWriteReview, { resources, open: true });
	await screen.getByRole('button', { name: 'Review', exact: true }).click();
	const observed = resources.editBase(identity);
	await resources.append({
		operationId: crypto.randomUUID(),
		key,
		command: { kind: 'renameProject', projectId: project.id, name: 'Later edit' },
		base: observed.base,
		basedOn: operationId,
		local: { type: 'projects', value: { ...project, name: 'Later edit' } },
		coalesce: null,
		references: []
	});
	await screen.getByRole('button', { name: 'Discard local change' }).click();
	await expect
		.element(screen.getByRole('alert'))
		.toHaveTextContent('Review dependent edits before discarding their base');
});

it('closes retained change details when the account session stops', async () => {
	const { resources } = await setup();
	const screen = render(WorkspaceWriteReview, { resources, open: true });
	await screen.getByRole('button', { name: 'Review', exact: true }).click();
	resources.stop();
	await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
});
