import { expect, it } from 'vitest';
import {
	attachmentActionsFixture,
	attachmentRecords,
	publishAttachmentRecords
} from '$lib/testing/attachments/fixtures/browser-actions';
import {
	testNoteId,
	testProjectId,
	testTodoId
} from '$lib/testing/workspace/fixtures/domain-builders';
const owner = { kind: 'project' as const, id: testProjectId() };
const file = new File(['hello'], 'brief.txt');
it.each(['checksum', 'reservation', 'transfer', 'completion'] as const)(
	'stops late upload work across same-account replacement during %s',
	async (stage) => {
		const { controller, remote, browser, workspace } = attachmentActionsFixture();
		const gate = Promise.withResolvers<void>();
		if (stage === 'checksum') browser.checksumGate = gate.promise;
		if (stage === 'reservation') remote.initiationGate = gate.promise;
		if (stage === 'transfer') browser.writeGate = gate.promise;
		if (stage === 'completion') remote.completionGate = gate.promise;
		const result = controller.uploadInline(testNoteId(), file).then(
			() => 'unexpected success',
			(error: Error) => error.message
		);
		await (stage === 'checksum'
			? browser.checksumStarted.promise
			: stage === 'reservation'
				? remote.initiationStarted.promise
				: stage === 'transfer'
					? browser.writeStarted.promise
					: remote.completionStarted.promise);
		workspace.replace();
		gate.resolve();
		expect({
			result: await result,
			completions: remote.completed.length,
			opened: browser.opened
		}).toEqual({
			result: 'The workspace account changed during the attachment action.',
			completions: stage === 'completion' ? 1 : 0,
			opened: []
		});
	}
);
it.each(['closed', 'switched', 'restarted'] as const)(
	'does not open a download after the account is %s',
	async (change) => {
		const { controller, remote, browser, workspace } = attachmentActionsFixture();
		const gate = Promise.withResolvers<void>();
		remote.downloadGate = gate.promise;
		const pending = controller.download(remote.result.attachment.id).then(
			() => '',
			(error: Error) => error.message
		);
		await remote.downloadStarted.promise;
		if (change === 'closed') workspace.stop();
		else workspace.replace(change === 'switched' ? 'other-account' : undefined);
		gate.resolve();
		expect({ failure: await pending, opened: browser.opened }).toEqual({
			failure: 'The workspace account changed during the attachment action.',
			opened: []
		});
	}
);
it('rejects an unbound upload before reservation or transfer', async () => {
	const { controller, remote, browser, workspace } = attachmentActionsFixture();
	workspace.stop();
	const failure = await controller.upload(owner, file).then(
		() => '',
		(error: Error) => error.message
	);
	expect({ failure, reservations: remote.initiated, writes: browser.writes }).toEqual({
		failure: 'The workspace is not open.',
		reservations: [],
		writes: []
	});
});
it('does not commit a late pull after session replacement', async () => {
	const { controller, remote, workspace } = attachmentActionsFixture();
	publishAttachmentRecords(attachmentRecords(remote.result), workspace.transport.records);
	const gate = workspace.transport.pause('changes');
	const pending = controller.prepare().then(
		() => '',
		(error: Error) => error.message
	);
	await gate.started;
	workspace.replace();
	gate.release();
	expect({
		failure: await pending,
		stored: await workspace.cache.load(workspace.account.accountId),
		list: controller.list(owner)
	}).toEqual({
		failure: 'The workspace account changed during the attachment action.',
		stored: { records: [], cursor: null, inventoryComplete: false },
		list: []
	});
});

it('does not return a screenshot URL after its account is replaced', async () => {
	const { controller, remote, workspace } = attachmentActionsFixture();
	const gate = Promise.withResolvers<void>();
	remote.completionGate = gate.promise;
	const pending = controller
		.uploadScreenshot(
			testTodoId(),
			testProjectId(),
			new File(['image'], 'screen.png', { type: 'image/png' })
		)
		.then(
			() => 'unexpected URL',
			(error: Error) => error.message
		);
	await remote.completionStarted.promise;
	workspace.replace();
	gate.resolve();
	expect(await pending).toBe('The workspace account changed during the attachment action.');
});
