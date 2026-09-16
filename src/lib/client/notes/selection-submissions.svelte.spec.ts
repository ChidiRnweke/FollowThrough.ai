import { afterEach, beforeEach, expect, it } from 'vitest';
import { SelectionSubmissions } from './selection-submissions';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const clearScenario = () => {
	for (const account of ['promise-test-a', 'promise-test-b'])
		for (const action of ['promise', 'reference', 'relate'])
			sessionStorage.removeItem(`followthrough.notes.${action}-submissions.${account}`);
};
beforeEach(clearScenario);
afterEach(clearScenario);

const selection = { noteId: testNoteId(), revision: 1, from: 0, to: 4, text: 'Send' };

it('restores an uncertain related-note request after a refresh', () => {
	const first = new SelectionSubmissions(sessionStorage, 'relate').prepare(
		'promise-test-a',
		selection
	);
	expect(
		new SelectionSubmissions(sessionStorage, 'relate').prepare('promise-test-a', { ...selection })
			.requestId
	).toBe(first.requestId);
});

it('keeps related-note and reference-search identities distinct', () => {
	const first = new SelectionSubmissions(sessionStorage, 'relate').prepare(
		'promise-test-a',
		selection
	);
	expect(
		new SelectionSubmissions(sessionStorage, 'reference').prepare('promise-test-a', selection)
			.requestId
	).not.toBe(first.requestId);
});

it('restores an uncertain reference request after a refresh', () => {
	const first = new SelectionSubmissions(sessionStorage, 'reference').prepare(
		'promise-test-a',
		selection
	);
	expect(
		new SelectionSubmissions(sessionStorage, 'reference').prepare('promise-test-a', {
			...selection
		}).requestId
	).toBe(first.requestId);
});

it('keeps promise extraction and reference search identities distinct for the same selection', () => {
	const first = new SelectionSubmissions(sessionStorage, 'reference').prepare(
		'promise-test-a',
		selection
	);
	expect(
		new SelectionSubmissions(sessionStorage, 'promises').prepare('promise-test-a', selection)
			.requestId
	).not.toBe(first.requestId);
});

it('reuses the saved request in a new client instance after an uncertain response', () => {
	const storage = sessionStorage;
	const first = new SelectionSubmissions(storage, 'promises').prepare('promise-test-a', selection);
	expect(
		new SelectionSubmissions(storage, 'promises').prepare('promise-test-a', { ...selection })
			.requestId
	).toBe(first.requestId);
});

it('starts a new request after the previous receipt was acknowledged', () => {
	const submissions = new SelectionSubmissions(sessionStorage, 'promises');
	const first = submissions.prepare('promise-test-a', selection);
	submissions.acknowledge('promise-test-a', first.requestId);
	expect(submissions.prepare('promise-test-a', selection).requestId).not.toBe(first.requestId);
});

it('keeps another account from reusing an uncertain request', () => {
	const submissions = new SelectionSubmissions(sessionStorage, 'promises');
	const first = submissions.prepare('promise-test-a', selection);
	expect(submissions.prepare('promise-test-b', selection).requestId).not.toBe(first.requestId);
});

it('gives a changed selection a distinct request', () => {
	const submissions = new SelectionSubmissions(sessionStorage, 'promises');
	const first = submissions.prepare('promise-test-a', selection);
	expect(submissions.prepare('promise-test-a', { ...selection, revision: 2 }).requestId).not.toBe(
		first.requestId
	);
});

it('reports corrupt saved identity instead of silently starting duplicate work', () => {
	const storage = sessionStorage;
	new SelectionSubmissions(storage, 'promises').prepare('promise-test-a', selection);
	storage.setItem('followthrough.notes.promise-submissions.promise-test-a', 'corrupt');
	expect(() =>
		new SelectionSubmissions(storage, 'promises').prepare('promise-test-a', selection)
	).toThrow();
});
