import { expect, it } from 'vitest';
import { attachmentActionsFixture } from '$lib/testing/attachments/fixtures/browser-actions';
import { testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
const owner = { kind: 'project' as const, id: testProjectId() };
const file = new File(['hello'], 'brief.txt', { type: 'text/plain' });
it('reserves, stores the bytes and completes a list upload', async () => {
	const { controller, remote, browser } = attachmentActionsFixture();
	await controller.upload(owner, file);
	expect({ stored: browser.writes.length, completed: remote.completed }).toEqual({
		stored: 1,
		completed: [{ uploadId: remote.uploadId }]
	});
});
it.each([
	['signed out', null],
	['replaced', 'a0000000-0000-4000-8000-000000000003']
] as const)('does not complete an upload after the account is %s mid-transfer', async (_, next) => {
	const { controller, remote, browser } = attachmentActionsFixture();
	const gate = Promise.withResolvers<void>();
	browser.writeGate = gate.promise;
	const result = controller.upload(owner, file).then(
		() => 'unexpected success',
		(error: Error) => error.message
	);
	await browser.writeStarted.promise;
	browser.accountId = next;
	gate.resolve();
	expect({ outcome: await result, completed: remote.completed }).toEqual({
		outcome: 'The workspace account changed during the attachment action.',
		completed: []
	});
});
it('reports a completion failure to the caller', async () => {
	const { controller, remote } = attachmentActionsFixture();
	remote.completionFailure = new Error('Completion unavailable');
	const outcome = await controller.upload(owner, file).then(
		() => 'unexpected success',
		(error: Error) => error.message
	);
	expect(outcome).toBe('Completion unavailable');
});
