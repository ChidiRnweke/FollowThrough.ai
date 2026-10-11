import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import { syncEtag } from '$lib/models/sync';
import type { WriteOutcome } from '$lib/models/outbox';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceController } from '$lib/controllers/workspace/workspace';
import { projectBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { offlineWorkspace } from '$lib/testing/workspace/fixtures/workspace';
import WorkspaceWriteReview from './workspace-write-review.svelte';

const started: WorkspaceController[] = [];
afterEach(() => {
	for (const workspace of started.splice(0)) workspace.stop();
});

/**
 * One local change to "My project": a creation still queued offline, or a rename the server
 * rejected or answered with a conflict.
 */
const setup = async (
	status: 'queued' | 'rejected' | 'conflict' = 'queued',
	remote: 'found' | 'deleted' = 'found'
) => {
	const project = projectBuilder({ name: 'My project' });
	const identity: WorkspaceResourceIdentity = { type: 'projects', id: [project.id] };
	const fixture = await offlineWorkspace(project.userId);
	started.push(fixture.workspace);
	const { resources } = fixture;
	if (status === 'queued') {
		await resources.create({ kind: 'createProject', id: project.id, name: project.name });
		return { resources, project, identity };
	}
	await fixture.store({ type: 'projects', value: { ...project, name: 'Original' } });
	const draft = resources.draft({ type: 'projects', id: [project.id] });
	await draft.read();
	await draft.stage({ kind: 'renameProject', projectId: project.id, name: project.name });
	const answer: WriteOutcome<WorkspaceRecord> =
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
				};
	fixture.transport.sendWrite = async () => answer;
	fixture.environment.online = true;
	resources.setOnline(true);
	await resources.synchronize();
	await vi.waitFor(() => {
		if (resources.pending[0]?.delivery.kind !== status)
			throw new Error('The server has not answered yet');
	});
	resources.setOnline(false);
	return { resources, project, identity };
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
	started.forEach((workspace) => workspace.stop());
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
