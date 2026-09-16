import { afterEach, beforeEach, expect, it } from 'vitest';
import { PromiseSubmissions } from './promise-submissions';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const clearScenario = () => {
	for (const account of ['promise-test-a', 'promise-test-b'])
		sessionStorage.removeItem('followthrough.notes.promise-submissions.' + account);
};
beforeEach(clearScenario);
afterEach(clearScenario);

const selection = { noteId: testNoteId(), revision: 1, from: 0, to: 4, text: 'Send' };

it('reuses the saved request in a new client instance after an uncertain response', () => {
	const storage = sessionStorage;
	const first = new PromiseSubmissions(storage).prepare('promise-test-a', selection);
	expect(
		new PromiseSubmissions(storage).prepare('promise-test-a', { ...selection }).requestId
	).toBe(first.requestId);
});

it('starts a new request after the previous receipt was acknowledged', () => {
	const submissions = new PromiseSubmissions(sessionStorage);
	const first = submissions.prepare('promise-test-a', selection);
	submissions.acknowledge('promise-test-a', first.requestId);
	expect(submissions.prepare('promise-test-a', selection).requestId).not.toBe(first.requestId);
});

it('keeps another account from reusing an uncertain request', () => {
	const submissions = new PromiseSubmissions(sessionStorage);
	const first = submissions.prepare('promise-test-a', selection);
	expect(submissions.prepare('promise-test-b', selection).requestId).not.toBe(first.requestId);
});

it('gives a changed selection a distinct request', () => {
	const submissions = new PromiseSubmissions(sessionStorage);
	const first = submissions.prepare('promise-test-a', selection);
	expect(submissions.prepare('promise-test-a', { ...selection, revision: 2 }).requestId).not.toBe(
		first.requestId
	);
});

it('reports corrupt saved identity instead of silently starting duplicate work', () => {
	const storage = sessionStorage;
	new PromiseSubmissions(storage).prepare('promise-test-a', selection);
	storage.setItem('followthrough.notes.promise-submissions.promise-test-a', 'corrupt');
	expect(() => new PromiseSubmissions(storage).prepare('promise-test-a', selection)).toThrow();
});
