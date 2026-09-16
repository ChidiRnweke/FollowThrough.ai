import { beforeEach, afterEach, expect, it } from 'vitest';
import { DiagramSubmissions } from './diagram-submissions';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const clearScenario = () => {
	for (const account of ['diagram-test-a', 'diagram-test-b'])
		sessionStorage.removeItem(`followthrough.notes.diagram-submissions.${account}`);
};
beforeEach(clearScenario);
afterEach(clearScenario);
const revision = {
	operation: 'revise' as const,
	noteId: testNoteId(),
	source: 'flowchart LR\nA --> B',
	instruction: 'Add a queue'
};

it('restores the same diagram request after refresh despite a different input property order', () => {
	const first = new DiagramSubmissions(sessionStorage).prepare('diagram-test-a', revision);
	expect(
		new DiagramSubmissions(sessionStorage).prepare('diagram-test-a', {
			instruction: revision.instruction,
			source: revision.source,
			noteId: revision.noteId,
			operation: 'revise'
		}).requestId
	).toBe(first.requestId);
});

it('keeps identical diagram requests separate for different accounts', () => {
	const first = new DiagramSubmissions(sessionStorage).prepare('diagram-test-a', revision);
	expect(
		new DiagramSubmissions(sessionStorage).prepare('diagram-test-b', revision).requestId
	).not.toBe(first.requestId);
});

it('uses a new request when the diagram revision instruction changes', () => {
	const first = new DiagramSubmissions(sessionStorage).prepare('diagram-test-a', revision);
	expect(
		new DiagramSubmissions(sessionStorage).prepare('diagram-test-a', {
			...revision,
			instruction: 'Remove the queue'
		}).requestId
	).not.toBe(first.requestId);
});

it('releases the diagram request identity only after its receipt is acknowledged', () => {
	const submissions = new DiagramSubmissions(sessionStorage);
	const first = submissions.prepare('diagram-test-a', revision);
	submissions.acknowledge('diagram-test-a', first.requestId);
	expect(submissions.prepare('diagram-test-a', revision).requestId).not.toBe(first.requestId);
});

it('preserves the uncertain diagram generation request with its full selection', () => {
	const input = {
		operation: 'generate' as const,
		selection: { noteId: testNoteId(), revision: 1, from: 0, to: 4, text: 'Send' }
	};
	const first = new DiagramSubmissions(sessionStorage).prepare('diagram-test-a', input);
	expect(new DiagramSubmissions(sessionStorage).prepare('diagram-test-a', input)).toEqual(first);
});

it('preserves the uncertain draw.io conversion request', () => {
	const input = { operation: 'convert' as const, noteId: testNoteId(), source: revision.source };
	const first = new DiagramSubmissions(sessionStorage).prepare('diagram-test-a', input);
	expect(new DiagramSubmissions(sessionStorage).prepare('diagram-test-a', input)).toEqual(first);
});

it('reports corrupt saved requests instead of treating them as a new submission', () => {
	sessionStorage.setItem('followthrough.notes.diagram-submissions.diagram-test-a', 'broken');
	expect(() =>
		new DiagramSubmissions(sessionStorage).prepare('diagram-test-a', revision)
	).toThrow();
});
