import { afterEach, beforeEach, expect, it } from 'vitest';
import { noteSubmissionFixture } from '$lib/testing/notes/fixtures/submissions';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
const accountId = 'note-action-test';
const key = `followthrough.notes.diagram-submissions.${accountId}`;
const clearScenario = () => sessionStorage.removeItem(key);
beforeEach(clearScenario);
afterEach(clearScenario);
const selection = { noteId: testNoteId(), revision: 1, from: 0, to: 4, text: 'Send' };
const setup = () => noteSubmissionFixture(sessionStorage, accountId);
it('returns the durable receipt and releases the acknowledged diagram identity', async () => {
	const { actions, remote } = setup();
	remote.failure = null;
	const receipt = await actions.generateDiagram(selection);
	expect({ receipt, retained: sessionStorage.getItem(key), error: actions.lastError }).toEqual({
		receipt: remote.receipt,
		retained: null,
		error: undefined
	});
});
it('reports submission failure while preserving its uncertain identity', async () => {
	const { actions, remote } = setup();
	const receipt = await actions.generateDiagram(selection);
	expect({
		receipt,
		retained: sessionStorage.getItem(key) !== null,
		error: actions.lastError
	}).toEqual({ receipt: undefined, retained: true, error: remote.failure?.message });
});
it('does not publish a receipt after the workspace session stopped', async () => {
	const { actions, remote, session } = setup();
	remote.failure = null;
	const gate = remote.pause();
	const sending = actions.generateDiagram(selection);
	await gate.started;
	session.accountId = null;
	session.generation++;
	gate.release();
	const receipt = await sending;
	expect({ receipt, error: actions.lastError, retained: sessionStorage.getItem(key) }).toEqual({
		receipt: undefined,
		error: undefined,
		retained: null
	});
});
it('does not publish an old account failure into the replacement workspace', async () => {
	const { actions, remote, session } = setup();
	const gate = remote.pause();
	const sending = actions.generateDiagram(selection);
	await gate.started;
	session.accountId = 'next-account';
	session.generation++;
	gate.release();
	const receipt = await sending;
	expect({
		receipt,
		error: actions.lastError,
		retained: sessionStorage.getItem(key) !== null,
		running: actions.running
	}).toEqual({ receipt: undefined, error: undefined, retained: true, running: false });
});
