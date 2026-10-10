import { beforeEach, afterEach, expect, it } from 'vitest';
import { noteSubmissionFixture } from '$lib/testing/notes/fixtures/submissions';
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

it('restores the same diagram request after refresh despite a different input property order', async () => {
	const first = await noteSubmissionFixture(sessionStorage).uncertainDiagram(
		'diagram-test-a',
		revision
	);
	const next = await noteSubmissionFixture(sessionStorage).uncertainDiagram('diagram-test-a', {
		instruction: revision.instruction,
		source: revision.source,
		noteId: revision.noteId,
		operation: 'revise'
	});
	expect(next.requestId).toBe(first.requestId);
});
it('keeps another account from reusing an uncertain diagram request', async () => {
	const fixture = noteSubmissionFixture(sessionStorage);
	const first = await fixture.uncertainDiagram('diagram-test-a', revision);
	const next = await fixture.uncertainDiagram('diagram-test-b', revision);
	expect(next.requestId).not.toBe(first.requestId);
});
it('uses a new request when the diagram revision instruction changes', async () => {
	const fixture = noteSubmissionFixture(sessionStorage);
	const first = await fixture.uncertainDiagram('diagram-test-a', revision);
	const next = await fixture.uncertainDiagram('diagram-test-a', {
		...revision,
		instruction: 'Remove the queue'
	});
	expect(next.requestId).not.toBe(first.requestId);
});
it('releases the diagram request identity only after its receipt is acknowledged', async () => {
	const fixture = noteSubmissionFixture(sessionStorage);
	fixture.remote.failure = null;
	await fixture.submitDiagram('diagram-test-a', revision);
	const first = fixture.remote.diagrams[0];
	const next = await noteSubmissionFixture(sessionStorage).uncertainDiagram(
		'diagram-test-a',
		revision
	);
	expect(next.requestId).not.toBe(first.requestId);
});
it('preserves the uncertain diagram generation request with its full selection', async () => {
	const input = {
		operation: 'generate' as const,
		selection: { noteId: testNoteId(), revision: 1, from: 0, to: 4, text: 'Send' }
	};
	const first = await noteSubmissionFixture(sessionStorage).uncertainDiagram(
		'diagram-test-a',
		input
	);
	expect(
		await noteSubmissionFixture(sessionStorage).uncertainDiagram('diagram-test-a', input)
	).toEqual(first);
});
it('preserves the uncertain draw.io conversion request', async () => {
	const input = { operation: 'convert' as const, noteId: testNoteId(), source: revision.source };
	const first = await noteSubmissionFixture(sessionStorage).uncertainDiagram(
		'diagram-test-a',
		input
	);
	expect(
		await noteSubmissionFixture(sessionStorage).uncertainDiagram('diagram-test-a', input)
	).toEqual(first);
});
it('reports corrupt saved requests instead of treating them as a new submission', async () => {
	sessionStorage.setItem('followthrough.notes.diagram-submissions.diagram-test-a', 'broken');
	const fixture = noteSubmissionFixture(sessionStorage);
	const receipt = await fixture.submitDiagram('diagram-test-a', revision);
	expect({ receipt, error: fixture.actions.lastError, sent: fixture.remote.diagrams }).toEqual({
		receipt: undefined,
		error: expect.any(String),
		sent: []
	});
});
