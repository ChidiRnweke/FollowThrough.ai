import { CacheSynchronization } from '$lib/controllers/sync/cache';
import { expect, it } from 'vitest';
import {
	attachmentActionsFixture,
	attachmentRecords,
	publishAttachmentRecords
} from '$lib/testing/attachments/fixtures/browser-actions';
import { testProjectId, testActor } from '$lib/testing/workspace/fixtures/domain-builders';
const owner = { kind: 'project' as const, id: testProjectId() };
it('prepares completed metadata and retains all records in the incremental checkpoint', async () => {
	const { controller, remote, workspace } = attachmentActionsFixture();
	publishAttachmentRecords(attachmentRecords(remote.result), workspace.transport.records);
	workspace.transport.pageSize = 1;
	await controller.prepare();
	const stored = await workspace.cache.load(workspace.account.accountId);
	expect({
		list: controller.list(owner),
		ready: controller.ready,
		count: stored.records.length,
		cursor: stored.cursor
	}).toEqual({
		list: [
			{ ...remote.result, attachment: { ...remote.result.attachment, userId: testActor().userId } }
		],
		ready: true,
		count: 3,
		cursor: '3'
	});
});
it('fails refresh explicitly and permits a subsequent successful retry', async () => {
	const { controller, remote, workspace } = attachmentActionsFixture();
	workspace.transport.pullFailure = 'Unavailable metadata';
	const failure = await controller.refresh().then(
		() => '',
		(error: Error) => error.message
	);
	workspace.transport.pullFailure = null;
	publishAttachmentRecords(attachmentRecords(remote.result), workspace.transport.records);
	await controller.prepare();
	expect({ failure, paths: controller.list(owner).map((item) => item.attachment.path) }).toEqual({
		failure: 'Unavailable metadata',
		paths: ['brief.pdf']
	});
});
it('does not mistake an incomplete offline inventory for an empty completed list', async () => {
	const { controller, workspace } = attachmentActionsFixture();
	workspace.environment.online = false;
	await controller.prepare();
	expect({ ready: controller.ready, list: controller.list(owner) }).toEqual({
		ready: false,
		list: []
	});
});
it('recovers preparation after a local read failure', async () => {
	const { controller, workspace } = attachmentActionsFixture();
	workspace.repository.snapshotFailure = 'Local storage unavailable';
	const failure = await controller.prepare().then(
		() => '',
		(error: Error) => error.message
	);
	workspace.repository.snapshotFailure = null;
	await controller.prepare();
	expect({ failure, ready: controller.ready }).toEqual({
		failure: 'Local storage unavailable',
		ready: true
	});
});
it('pulls again when completion happens during an older snapshot', async () => {
	const { controller, remote, workspace } = attachmentActionsFixture();
	await controller.prepare();
	const gate = workspace.transport.pause('changes');
	const earlier = controller.refresh();
	await gate.started;
	const uploaded = controller.upload(owner, new File(['hello'], 'brief.pdf'));
	await remote.completionStarted.promise;
	publishAttachmentRecords(attachmentRecords(remote.result), workspace.transport.records);
	gate.release();
	await Promise.all([earlier, uploaded]);
	expect(controller.list(owner)).toEqual([
		{ ...remote.result, attachment: { ...remote.result.attachment, userId: testActor().userId } }
	]);
});
it('keeps a higher committed version and checkpoint when an older pull returns', async () => {
	const { controller, remote, workspace } = attachmentActionsFixture();
	publishAttachmentRecords(attachmentRecords(remote.result), workspace.transport.records);
	const gate = workspace.transport.pause('changes');
	const pending = controller.prepare();
	await gate.started;
	const newer = {
		...remote.result,
		attachment: { ...remote.result.attachment, path: 'newer.pdf' }
	};
	const rows = new Map(workspace.transport.records);
	publishAttachmentRecords(attachmentRecords(newer), rows, 20);
	await workspace.cache.commit(workspace.account.accountId, {
		put: [...rows].map(([key, snapshot]) => ({ key, entry: { kind: 'present', snapshot } })),
		remove: [],
		cursor: '20' as never,
		inventoryComplete: true
	});
	gate.release();
	await pending;
	expect({
		list: controller.list(owner),
		cursor: (await workspace.cache.load(workspace.account.accountId)).cursor
	}).toEqual({
		list: [{ ...newer, attachment: { ...newer.attachment, userId: testActor().userId } }],
		cursor: '20'
	});
});
it('retains neither records nor checkpoint when an atomic cache write fails', async () => {
	const { controller, remote, workspace } = attachmentActionsFixture();
	publishAttachmentRecords(attachmentRecords(remote.result), workspace.transport.records);
	workspace.cache.writeFailure = 'Disk full';
	const failure = await controller.prepare().then(
		() => '',
		(error: Error) => error.message
	);
	expect({ failure, stored: await workspace.cache.load(workspace.account.accountId) }).toEqual({
		failure: 'Disk full',
		stored: { records: [], cursor: null, inventoryComplete: false }
	});
});

it('coordinates a mutation with an already running general workspace pull', async () => {
	const { controller, remote, workspace } = attachmentActionsFixture();
	await controller.prepare();
	const cache = new CacheSynchronization(
		workspace.account.accountId,
		{ repository: workspace.cache, transport: workspace.transport },
		workspace.cacheState
	);
	const gate = workspace.transport.pause('changes');
	const general = cache.refresh();
	await gate.started;
	const upload = controller.upload(owner, new File(['hello'], 'brief.pdf'));
	await remote.completionStarted.promise;
	publishAttachmentRecords(attachmentRecords(remote.result), workspace.transport.records);
	gate.release();
	await Promise.all([general, upload]);
	expect({
		paths: controller.list(owner).map((item) => item.attachment.path),
		cursor: (await workspace.cache.load(workspace.account.accountId)).cursor
	}).toEqual({ paths: ['brief.pdf'], cursor: '3' });
});
