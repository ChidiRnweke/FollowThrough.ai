import { noteBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import { syncEtag } from '$lib/models/sync';
import { noteWorkspaceFixture } from '$lib/testing/notes/fixtures/workspace';
import { afterEach, expect, it } from 'vitest';
const cleanups: (() => void)[] = [];
const setup = async () => {
	const fixture = await noteWorkspaceFixture();
	cleanups.push(() => fixture.close());
	return fixture;
};
afterEach(() => {
	for (const close of cleanups.splice(0)) close();
});

it('joins concurrent note and background retry without sending an operation twice', async () => {
	const f = await setup();
	f.edit('Queued');
	await f.controller.save();
	const pause = f.transport.pauseNextSend();
	f.resources.setOnline(true);
	const retry = f.controller.retrySync();
	await pause.started;
	const background = f.background.synchronize(true);
	pause.release();
	await Promise.all([retry, background]);
	expect({
		sent: f.transport.sent.map((input) => input.command),
		pending: await f.outbox.list(f.note.userId)
	}).toEqual({
		sent: [expect.objectContaining({ kind: 'saveNote', plainText: 'Queued' })],
		pending: []
	});
});
it('finishes durable submission when its initiating pane closes', async () => {
	const f = await setup();
	f.edit('Durable');
	await f.controller.save();
	const pause = f.transport.pauseNextSend();
	f.resources.setOnline(true);
	const retry = f.controller.retrySync();
	await pause.started;
	f.controller.close();
	pause.release();
	await retry;
	expect({
		receipt: (await f.outbox.receipt(f.note.userId, f.key))?.resource,
		pending: await f.outbox.list(f.note.userId)
	}).toEqual({
		receipt: {
			kind: 'found',
			snapshot: expect.objectContaining({
				value: { type: 'notes', value: expect.objectContaining({ plainText: 'Durable' }) }
			})
		},
		pending: []
	});
});
it('does not repopulate account state after a late send response', async () => {
	const f = await setup();
	f.edit('Old account');
	await f.controller.save();
	const pause = f.transport.pauseNextSend();
	f.resources.setOnline(true);
	const retry = f.controller.retrySync();
	await pause.started;
	f.resources.stop();
	pause.release();
	await retry;
	expect({
		resources: f.account.resourceState.local,
		queue: f.account.queueState.read().entries,
		cache: [...f.account.cacheState.read().entries],
		lane: f.account.executionState.lane('writes').result
	}).toEqual({ resources: null, queue: [], cache: [], lane: { kind: 'stopped' } });
});
it('keeps an account retry alive after the note pane closes', async () => {
	const f = await setup();
	f.edit('Retry me');
	await f.controller.save();
	f.transport.sendFailure = 'Disconnected';
	f.resources.setOnline(true);
	await f.controller.retrySync();
	f.controller.close();
	f.transport.sendFailure = null;
	await f.account.scheduler.advance(60000);
	expect({ sent: f.transport.sent.length, pending: await f.outbox.list(f.note.userId) }).toEqual({
		sent: 2,
		pending: []
	});
});
it('settles a lost send outcome before discarding local intent', async () => {
	const f = await setup();
	f.edit('Already applied');
	await f.controller.save();
	f.transport.loseNextResponse = true;
	f.resources.setOnline(true);
	await f.controller.retrySync();
	await f.controller.useRemoteVersion();
	expect({
		text: f.controller.note.plainText,
		pending: await f.outbox.list(f.note.userId),
		receipt: (await f.outbox.receipt(f.note.userId, f.key))?.resource.kind
	}).toEqual({ text: 'Already applied', pending: [], receipt: 'found' });
});
it('retains uncertain sends when offline recovery cannot prove cancellation', async () => {
	const f = await setup();
	f.edit('Keep proof');
	await f.controller.save();
	f.transport.loseNextResponse = true;
	f.resources.setOnline(true);
	await f.controller.retrySync();
	f.resources.setOnline(false);
	const result = await f.controller.useRemoteVersion().then(
		() => ({ kind: 'success' }),
		(error) => ({ kind: 'failure', message: error.message })
	);
	expect({
		result,
		pending: (await f.outbox.list(f.note.userId)).map((entry) => entry.delivery.kind)
	}).toEqual({
		result: { kind: 'failure', message: 'Reconnect to confirm the last send before discarding' },
		pending: ['retry']
	});
});

it('keeps coalesced later typing when a discard waited for the account writer', async () => {
	const f = await setup();
	f.edit('First');
	await f.controller.save();
	const locked = Promise.withResolvers<void>(),
		release = Promise.withResolvers<void>();
	const holding = f.account.writerLock.run(f.note.userId, async () => {
		locked.resolve();
		await release.promise;
	});
	await locked.promise;
	const discarding = f.controller.useRemoteVersion().then(
		() => ({ kind: 'success' }),
		(error) => ({ kind: 'failure', message: error.message })
	);
	f.edit('Later');
	await f.controller.save();
	release.resolve();
	await holding;
	const result = await discarding;
	expect({
		result,
		text: f.editor.plainText,
		pending: (await f.outbox.list(f.note.userId)).map((entry) => entry.intent.command.kind)
	}).toEqual({
		result: { kind: 'failure', message: 'The selected local edits changed; review them again' },
		text: 'Later',
		pending: ['saveNote']
	});
});
it('does not let a superseded wake duplicate a successful retry', async () => {
	const f = await setup();
	f.edit('Queued');
	await f.controller.save();
	f.transport.sendFailure = 'Disconnected';
	f.resources.setOnline(true);
	await f.controller.retrySync();
	f.background.setOnline(true);
	f.transport.sendFailure = null;
	await Promise.all([f.background.synchronize(true), f.controller.retrySync()]);
	await f.account.scheduler.advance(60000);
	expect({ sent: f.transport.sent.length, pending: await f.outbox.list(f.note.userId) }).toEqual({
		sent: 2,
		pending: []
	});
});

it('rejects discarding a base when later edits became dependent while waiting for the writer', async () => {
	const f = await setup();
	f.edit('First');
	await f.controller.save();
	f.transport.sendFailure = 'Disconnected';
	f.resources.setOnline(true);
	await f.controller.retrySync();
	f.resources.setOnline(false);
	const locked = Promise.withResolvers<void>(),
		release = Promise.withResolvers<void>();
	const holding = f.account.writerLock.run(f.note.userId, async () => {
		locked.resolve();
		await release.promise;
	});
	await locked.promise;
	const discarding = f.controller.useRemoteVersion().then(
		() => ({ kind: 'success' }),
		(error) => ({ kind: 'failure', message: error.message })
	);
	f.edit('Dependent');
	await f.controller.save();
	release.resolve();
	await holding;
	expect({
		result: await discarding,
		pending: (await f.outbox.list(f.note.userId)).length,
		text: f.editor.plainText
	}).toEqual({
		result: { kind: 'failure', message: 'Review dependent edits before discarding their base' },
		pending: 2,
		text: 'Dependent'
	});
});

it('interrupts a held targeted read when note synchronization loses its account binding', async () => {
	const f = await setup();
	f.resources.setOnline(true);
	const gate = f.transport.pause('held-note');
	const opening = f.cache.open('held-note');
	await gate.started;
	f.binding.accountId = 'replacement-account';
	try {
		await f.controller.useRemoteVersion();
		expect({
			opened: await opening,
			disposed: f.binding.disposed,
			reloaded: f.binding.reloaded
		}).toEqual({
			opened: { kind: 'unavailable' },
			disposed: true,
			reloaded: true
		});
	} finally {
		gate.release();
	}
});

it('drains another note’s queued edit through the same account retry lane', async () => {
	const f = await setup();
	const other = noteBuilder({
		id: testNoteId(2),
		userId: f.note.userId,
		projectId: f.note.projectId,
		title: 'Sibling'
	});
	const key = workspaceResourceKey({ type: 'notes', id: [other.id] });
	const snapshot = { etag: syncEtag(1n), value: { type: 'notes' as const, value: other } };
	f.transport.records.set(key, snapshot);
	await f.cache.accept(key, snapshot);
	const sibling = f.resources.draft({ type: 'notes', id: [other.id] });
	sibling.capture();
	await sibling.stage({
		kind: 'saveNote',
		noteId: other.id,
		document: other.document,
		plainText: other.plainText,
		title: 'Saved sibling'
	});
	f.edit('Saved main');
	await f.controller.save();
	f.resources.setOnline(true);
	await f.controller.retrySync();
	expect({
		titles: f.transport.sent.map((input) =>
			input.command.kind === 'saveNote' ? input.command.title : input.command.kind
		),
		pending: await f.outbox.list(f.note.userId)
	}).toEqual({ titles: ['Saved sibling', 'Original'], pending: [] });
});
