import { expect, it } from 'vitest';
import { attachmentActionsFixture } from '$lib/testing/attachments/fixtures/browser-actions';
import { testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
const owner = { kind: 'project' as const, id: testProjectId() };
const file = new File(['hello'], 'brief.txt', { type: 'text/plain' });
it('completes a list upload before synchronizing the bound workspace', async () => {
	const { controller, remote, workspace } = attachmentActionsFixture();
	await controller.upload(owner, file);
	expect({
		completed: remote.completed,
		cache: await workspace.cache.load(workspace.account.accountId)
	}).toEqual({
		completed: [{ uploadId: remote.uploadId }],
		cache: { records: [], cursor: '0', inventoryComplete: true }
	});
});
it.each(['stopped', 'replaced'] as const)(
	'does not complete or synchronize a %s account after byte transfer',
	async (change) => {
		const { controller, remote, browser, workspace } = attachmentActionsFixture();
		const gate = Promise.withResolvers<void>();
		browser.writeGate = gate.promise;
		const result = controller.upload(owner, file).then(
			() => 'unexpected success',
			(error: Error) => error.message
		);
		await browser.writeStarted.promise;
		if (change === 'stopped') workspace.stop();
		else workspace.replace();
		gate.resolve();
		expect({
			outcome: await result,
			completed: remote.completed,
			cache: await workspace.cache.load(workspace.account.accountId)
		}).toEqual({
			outcome: 'The workspace account changed during the attachment action.',
			completed: [],
			cache: { records: [], cursor: null, inventoryComplete: false }
		});
	}
);
it('retains a completion failure without reporting a synchronized upload', async () => {
	const { controller, remote, workspace } = attachmentActionsFixture();
	remote.completionFailure = new Error('Completion unavailable');
	const outcome = await controller.upload(owner, file).then(
		() => 'unexpected success',
		(error: Error) => error.message
	);
	expect({ outcome, cache: await workspace.cache.load(workspace.account.accountId) }).toEqual({
		outcome: 'Completion unavailable',
		cache: { records: [], cursor: null, inventoryComplete: false }
	});
});
it('returns the note blocking removal without concealing that result', async () => {
	const { controller, remote } = attachmentActionsFixture();
	remote.removal = {
		kind: 'referenced-by-note',
		note: { id: '00000000-0000-4000-8000-000000000001' as never, title: 'Linked note' }
	};
	expect(await controller.remove(remote.result.attachment.id)).toEqual(remote.removal);
});
