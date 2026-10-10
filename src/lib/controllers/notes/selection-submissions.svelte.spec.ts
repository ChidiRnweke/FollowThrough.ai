import { afterEach, beforeEach, expect, it } from 'vitest';
import { noteSubmissionFixture } from '$lib/testing/notes/fixtures/submissions';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
const clearScenario = () => {
	for (const account of ['promise-test-a', 'promise-test-b'])
		for (const action of ['promise', 'reference', 'relate'])
			sessionStorage.removeItem(`followthrough.notes.${action}-submissions.${account}`);
};
beforeEach(clearScenario);
afterEach(clearScenario);

const selection = { noteId: testNoteId(), revision: 1, from: 0, to: 4, text: 'Send' };

it.each(['relate', 'reference', 'promises'] as const)(
	'restores an uncertain %s submission after refresh',
	async (action) => {
		const first = await noteSubmissionFixture(sessionStorage).uncertainSelection(
			'promise-test-a',
			action,
			selection
		);
		const next = await noteSubmissionFixture(sessionStorage).uncertainSelection(
			'promise-test-a',
			action,
			{ ...selection }
		);
		expect(next.requestId).toBe(first.requestId);
	}
);
it.each([
	['relate', 'reference'],
	['reference', 'promises']
] as const)('keeps %s and %s identities distinct', async (firstAction, nextAction) => {
	const fixture = noteSubmissionFixture(sessionStorage);
	const first = await fixture.uncertainSelection('promise-test-a', firstAction, selection);
	const next = await fixture.uncertainSelection('promise-test-a', nextAction, selection);
	expect(next.requestId).not.toBe(first.requestId);
});
it('starts a new request after the previous receipt was acknowledged', async () => {
	const fixture = noteSubmissionFixture(sessionStorage);
	fixture.remote.failure = null;
	await fixture.submitSelection('promise-test-a', 'promises', selection);
	const first = fixture.remote.selections[0].request;
	const next = await noteSubmissionFixture(sessionStorage).uncertainSelection(
		'promise-test-a',
		'promises',
		selection
	);
	expect(next.requestId).not.toBe(first.requestId);
});
it('keeps another account from reusing an uncertain request', async () => {
	const fixture = noteSubmissionFixture(sessionStorage);
	const first = await fixture.uncertainSelection('promise-test-a', 'promises', selection);
	const next = await fixture.uncertainSelection('promise-test-b', 'promises', selection);
	expect(next.requestId).not.toBe(first.requestId);
});
it('gives a changed selection a distinct request', async () => {
	const fixture = noteSubmissionFixture(sessionStorage);
	const first = await fixture.uncertainSelection('promise-test-a', 'promises', selection);
	const next = await fixture.uncertainSelection('promise-test-a', 'promises', {
		...selection,
		revision: 2
	});
	expect(next.requestId).not.toBe(first.requestId);
});
it('reports corrupt saved identity instead of silently starting duplicate work', async () => {
	const fixture = noteSubmissionFixture(sessionStorage);
	await fixture.uncertainSelection('promise-test-a', 'promises', selection);
	sessionStorage.setItem('followthrough.notes.promise-submissions.promise-test-a', 'corrupt');
	const receipt = await fixture.submitSelection('promise-test-a', 'promises', selection);
	expect({
		receipt,
		error: fixture.actions.lastError,
		sent: fixture.remote.selections.length
	}).toEqual({ receipt: undefined, error: expect.any(String), sent: 1 });
});
