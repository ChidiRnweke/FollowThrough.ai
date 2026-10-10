import { afterEach, beforeEach, expect, it } from 'vitest';
import { noteSubmissionFixture } from '$lib/testing/notes/fixtures/submissions';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const accountId = 'submission-concurrency';
const selection = { noteId: testNoteId(), revision: 1, from: 0, to: 4, text: 'Send' };
const clearScenario = () => {
	for (const action of ['diagram', 'promise', 'reference', 'relate'])
		sessionStorage.removeItem(`followthrough.notes.${action}-submissions.${accountId}`);
};
beforeEach(clearScenario);
afterEach(clearScenario);

it('persists the complete selection before sending it', async () => {
	const { actions, remote, selections } = noteSubmissionFixture(sessionStorage, accountId);
	remote.failure = null;
	const gate = remote.pause();
	const sending = actions.extractPromises(selection);
	await gate.started;
	const retainedWhileSending = selections.read(accountId, 'promises');
	gate.release();
	await sending;
	expect(retainedWhileSending).toEqual(remote.selections.map(({ request }) => request));
});
it('persists the complete diagram before sending it', async () => {
	const { actions, remote, diagrams } = noteSubmissionFixture(sessionStorage, accountId);
	remote.failure = null;
	const gate = remote.pause();
	const sending = actions.reviseDiagram(selection.noteId, 'flowchart LR\nA --> B', 'Add queue');
	await gate.started;
	const retainedWhileSending = diagrams.read(accountId);
	gate.release();
	await sending;
	expect(retainedWhileSending).toEqual(remote.diagrams);
});
it('does not send a selection when persistence fails', async () => {
	const storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
		getItem: () => null,
		setItem: () => {
			throw new Error('Storage is full');
		},
		removeItem: () => {
			throw new Error('No saved request exists');
		}
	};
	const { actions, remote } = noteSubmissionFixture(storage, accountId);
	const receipt = await actions.extractPromises(selection);
	expect({ receipt, error: actions.lastError, sent: remote.selections }).toEqual({
		receipt: undefined,
		error: 'Storage is full',
		sent: []
	});
});
it('does not send a diagram when persistence fails', async () => {
	const storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
		getItem: () => null,
		setItem: () => {
			throw new Error('Storage is full');
		},
		removeItem: () => {
			throw new Error('No saved request exists');
		}
	};
	const { actions, remote } = noteSubmissionFixture(storage, accountId);
	const receipt = await actions.generateDiagram(selection);
	expect({ receipt, error: actions.lastError, sent: remote.diagrams }).toEqual({
		receipt: undefined,
		error: 'Storage is full',
		sent: []
	});
});
it('acknowledges only the selection whose receipt arrived', async () => {
	const { actions, remote, selections } = noteSubmissionFixture(sessionStorage, accountId);
	remote.failure = null;
	const firstGate = remote.pause();
	const first = actions.extractPromises(selection);
	await firstGate.started;
	const secondGate = remote.pause();
	const second = actions.extractPromises({ ...selection, revision: 2 });
	await secondGate.started;
	secondGate.release();
	const secondReceipt = await second;
	const retained = selections.read(accountId, 'promises');
	firstGate.release();
	const firstReceipt = await first;
	expect({
		retained,
		receipts: [firstReceipt, secondReceipt],
		remaining: selections.read(accountId, 'promises')
	}).toEqual({
		retained: [remote.selections[0].request],
		receipts: [remote.receipts[0], remote.receipts[1]],
		remaining: []
	});
});
it('acknowledges only the diagram whose receipt arrived', async () => {
	const { actions, remote, diagrams } = noteSubmissionFixture(sessionStorage, accountId);
	remote.failure = null;
	const firstGate = remote.pause();
	const first = actions.generateDiagram(selection);
	await firstGate.started;
	const secondGate = remote.pause();
	const second = actions.generateDiagram({ ...selection, revision: 2 });
	await secondGate.started;
	secondGate.release();
	const secondReceipt = await second;
	const retained = diagrams.read(accountId);
	firstGate.release();
	const firstReceipt = await first;
	expect({
		retained,
		receipts: [firstReceipt, secondReceipt],
		remaining: diagrams.read(accountId)
	}).toEqual({
		retained: [remote.diagrams[0]],
		receipts: [remote.receipts[0], remote.receipts[1]],
		remaining: []
	});
});
it('reuses the identity of a concurrent request with the same intent', async () => {
	const { actions, remote } = noteSubmissionFixture(sessionStorage, accountId);
	remote.failure = null;
	const gate = remote.pause();
	const first = actions.generateDiagram(selection);
	await gate.started;
	const second = await actions.generateDiagram({ ...selection });
	gate.release();
	const receipt = await first;
	expect({
		requests: remote.diagrams.map(({ requestId }) => requestId),
		receipts: [receipt, second]
	}).toEqual({
		requests: [remote.diagrams[0].requestId, remote.diagrams[0].requestId],
		receipts: [remote.receipt, remote.receipt]
	});
});
it('retains the other uncertain request when one concurrent submission succeeds', async () => {
	const { actions, remote, diagrams } = noteSubmissionFixture(sessionStorage, accountId);
	const gate = remote.pause();
	const uncertain = actions.generateDiagram(selection);
	await gate.started;
	remote.failure = null;
	const receipt = await actions.generateDiagram({ ...selection, revision: 2 });
	gate.release();
	await uncertain;
	expect({ receipt, retained: diagrams.read(accountId), error: actions.lastError }).toEqual({
		receipt: remote.receipts[1],
		retained: [remote.diagrams[0]],
		error: undefined
	});
});
it('does not replace a newer operation error with an older failure', async () => {
	const { actions, remote } = noteSubmissionFixture(sessionStorage, accountId);
	remote.failure = new Error('Older failure');
	const gate = remote.pause();
	const older = actions.generateDiagram(selection);
	await gate.started;
	remote.failure = new Error('Newest failure');
	await actions.generateDiagram({ ...selection, revision: 2 });
	gate.release();
	await older;
	expect(actions.lastError).toBe('Newest failure');
});
it('suppresses a same-account old-session receipt while acknowledging only its request', async () => {
	const { actions, remote, session, diagrams } = noteSubmissionFixture(sessionStorage, accountId);
	remote.failure = null;
	const gate = remote.pause();
	const obsolete = actions.generateDiagram(selection);
	await gate.started;
	session.generation++;
	remote.failure = new Error('Replacement transport failed');
	await actions.generateDiagram({ ...selection, revision: 2 });
	gate.release();
	const receipt = await obsolete;
	expect({ receipt, retained: diagrams.read(accountId), error: actions.lastError }).toEqual({
		receipt: undefined,
		retained: [remote.diagrams[1]],
		error: 'Replacement transport failed'
	});
});
it('suppresses a same-account old-session failure and retains its uncertain request', async () => {
	const { actions, remote, session, diagrams } = noteSubmissionFixture(sessionStorage, accountId);
	const gate = remote.pause();
	const obsolete = actions.generateDiagram(selection);
	await gate.started;
	session.generation++;
	remote.failure = null;
	const current = await actions.generateDiagram({ ...selection, revision: 2 });
	gate.release();
	const receipt = await obsolete;
	expect({
		receipt,
		current,
		retained: diagrams.read(accountId),
		error: actions.lastError
	}).toEqual({
		receipt: undefined,
		current: remote.receipts[1],
		retained: [remote.diagrams[0]],
		error: undefined
	});
});

it('does not persist or send a submission without an active account', async () => {
	const { actions, remote, session, diagrams } = noteSubmissionFixture(sessionStorage, accountId);
	session.accountId = null;
	const receipt = await actions.generateDiagram(selection);
	expect({
		receipt,
		error: actions.lastError,
		sent: remote.diagrams,
		retained: diagrams.read(accountId)
	}).toEqual({
		receipt: undefined,
		error: 'Open the workspace before running a note action.',
		sent: [],
		retained: []
	});
});
