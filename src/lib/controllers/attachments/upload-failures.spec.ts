import { expect, it } from 'vitest';
import { attachmentActionsFixture } from '$lib/testing/attachments/fixtures/browser-actions';
import { testNoteId, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
const file = new File(['hello'], 'brief.txt');
it.each(['checksum', 'reservation', 'transfer', 'completion', 'refresh'] as const)(
	'preserves %s failure and allows another upload',
	async (stage) => {
		const { controller, remote, browser, workspace } = attachmentActionsFixture();
		if (stage === 'checksum') browser.checksumFailure = new Error('Checksum failed');
		if (stage === 'reservation') remote.initiationFailure = new Error('Reservation failed');
		if (stage === 'transfer')
			browser.writeResult = { kind: 'failure', status: 403, detail: 'Transfer failed' };
		if (stage === 'completion') remote.completionFailure = new Error('Completion failed');
		if (stage === 'refresh') workspace.transport.pullFailure = 'Refresh failed';
		const failure = await controller.upload({ kind: 'project', id: testProjectId() }, file).then(
			() => '',
			(error: Error) => error.message
		);
		const before = remote.completed.length;
		browser.checksumFailure = undefined;
		remote.initiationFailure = undefined;
		browser.writeResult = { kind: 'stored' };
		remote.completionFailure = undefined;
		workspace.transport.pullFailure = null;
		await controller.upload({ kind: 'project', id: testProjectId() }, file);
		expect({ failure, before, after: remote.completed.length }).toEqual({
			failure:
				stage === 'transfer'
					? 'Object storage rejected the upload: Transfer failed'
					: `${stage[0].toUpperCase()}${stage.slice(1)} failed`,
			before: stage === 'refresh' ? 1 : 0,
			after: stage === 'refresh' ? 2 : 1
		});
	}
);
it('keeps concurrent reservations distinct and completes each transferred upload', async () => {
	const { controller, remote, browser } = attachmentActionsFixture();
	const gate = Promise.withResolvers<void>();
	remote.initiationGate = gate.promise;
	const first = controller.uploadInline(testNoteId(), file);
	const second = controller.uploadInline(testNoteId(), file);
	await remote.initiationStarted.promise;
	gate.resolve();
	await Promise.all([first, second]);
	expect({
		paths: remote.initiated.map((x) => x.path).sort(),
		completed: remote.completed.map((x) => x.uploadId).sort(),
		writes: browser.writes.length
	}).toEqual({
		paths: [
			'inline/00000000-0000-4000-8000-000000000001/brief.txt',
			'inline/00000000-0000-4000-8000-000000000002/brief.txt'
		],
		completed: ['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102'],
		writes: 2
	});
});

it('waits for the reserved byte transfer before completing the upload', async () => {
	const { controller, remote, browser } = attachmentActionsFixture();
	const gate = Promise.withResolvers<void>();
	browser.writeGate = gate.promise;
	const pending = controller.uploadInline(testNoteId(), file);
	await browser.writeStarted.promise;
	const during = { reservations: remote.initiated.length, completions: remote.completed.length };
	gate.resolve();
	await pending;
	expect({ during, completed: remote.completed }).toEqual({
		during: { reservations: 1, completions: 0 },
		completed: [{ uploadId: remote.uploadId }]
	});
});
