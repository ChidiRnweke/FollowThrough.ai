import { expect, it } from 'vitest';
import { attachmentActionsFixture } from '$lib/testing/attachments/fixtures/browser-actions';
import { InMemoryAttachmentSession } from '$lib/testing/attachments/fakes/browser-actions';
import { testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
const owner = { kind: 'project' as const, id: testProjectId() };
const file = new File(['hello'], 'brief.txt', { type: 'text/plain' });
it('completes a list upload before synchronizing the bound workspace', async () => {
	const { controller, remote, workspace } = attachmentActionsFixture();
	const session = workspace.current;
	await controller.upload(owner, file);
	expect({ completed: remote.completed, synchronized: workspace.synchronized }).toEqual({
		completed: [{ uploadId: remote.uploadId }],
		synchronized: [session]
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
		workspace.current = change === 'stopped' ? null : new InMemoryAttachmentSession();
		gate.resolve();
		expect({
			outcome: await result,
			completed: remote.completed,
			synchronized: workspace.synchronized
		}).toEqual({
			outcome: 'The workspace account changed during the attachment action.',
			completed: [],
			synchronized: []
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
	expect({ outcome, synchronized: workspace.synchronized }).toEqual({
		outcome: 'Completion unavailable',
		synchronized: []
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
