import { expect, it } from 'vitest';
import { attachmentActionsFixture } from '$lib/testing/attachments/fixtures/browser-actions';
it('opens only the completed signed download URL', async () => {
	const { controller, remote, browser } = attachmentActionsFixture();
	await controller.download(remote.result.attachment.id);
	expect(browser.opened).toEqual(['https://storage.test/download']);
});
it('reports metadata failure after a processing retry instead of claiming success', async () => {
	const { controller, remote, workspace } = attachmentActionsFixture();
	workspace.transport.pullFailure = 'Metadata unavailable';
	const failure = await controller.retry(remote.result.attachment.id).then(
		() => '',
		(error: Error) => error.message
	);
	expect({ failure, retried: remote.retried }).toEqual({
		failure: 'Metadata unavailable',
		retried: [remote.result.attachment.id]
	});
});
it('preserves removal protection even when a metadata refresh would fail', async () => {
	const { controller, remote, workspace } = attachmentActionsFixture();
	remote.removal = {
		kind: 'referenced-by-note',
		note: { id: '00000000-0000-4000-8000-000000000001' as never, title: 'Linked note' }
	};
	workspace.transport.pullFailure = 'Offline';
	expect(await controller.remove(remote.result.attachment.id)).toEqual(remote.removal);
});
