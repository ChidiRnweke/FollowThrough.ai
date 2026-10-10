import { expect, it } from 'vitest';
import { noteSubmissionFixture } from '$lib/testing/notes/fixtures/submissions';
import { InMemoryNoteReviews } from '$lib/testing/notes/fakes/reviews';
import {
	diagramBuilder,
	testNoteId,
	testSuggestionId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const reviews = new InMemoryNoteReviews();
	return { ...noteSubmissionFixture(sessionStorage, 'immediate-review', reviews), reviews };
};
it('returns the accepted draw.io diagram and submits the reviewed source and rendering', async () => {
	const { actions, reviews } = setup();
	const diagram = await actions.acceptDrawio(
		testNoteId(),
		testSuggestionId(),
		reviews.diagram.source,
		reviews.diagram.renderedSvg
	);
	expect({ diagram, sent: reviews.acceptedInputs, running: actions.running }).toEqual({
		diagram: reviews.diagram,
		sent: [
			{
				suggestionId: testSuggestionId(),
				drawioReview: {
					noteId: testNoteId(),
					source: reviews.diagram.source,
					renderedSvg: reviews.diagram.renderedSvg
				}
			}
		],
		running: false
	});
});
it('returns the rejected diagram suggestion', async () => {
	const { actions, reviews } = setup();
	const result = await actions.rejectDrawio(testSuggestionId());
	expect({ result, sent: reviews.rejectedInputs, running: actions.running }).toEqual({
		result: { ...reviews.suggestion, status: 'rejected', decidedAt: testNow },
		sent: [{ suggestionId: testSuggestionId() }],
		running: false
	});
});
it('keeps review running until all concurrent reviews finish', async () => {
	const { actions, reviews } = setup();
	const firstGate = reviews.pause();
	const first = actions.rejectDrawio(testSuggestionId());
	await firstGate.started;
	const secondGate = reviews.pause();
	const second = actions.rejectDrawio(testSuggestionId(2));
	await secondGate.started;
	const bothRunning = actions.running;
	firstGate.release();
	await first;
	const secondRunning = actions.running;
	secondGate.release();
	await second;
	expect([bothRunning, secondRunning, actions.running]).toEqual([true, true, false]);
});
it.each(['account', 'generation'] as const)(
	'discards an old %s acceptance without clearing the replacement review',
	async (replacement) => {
		const { actions, reviews, session } = setup();
		const oldGate = reviews.pause();
		const old = actions.acceptDrawio(
			testNoteId(),
			testSuggestionId(),
			reviews.diagram.source,
			reviews.diagram.renderedSvg
		);
		await oldGate.started;
		if (replacement === 'account') session.accountId = 'replacement-review';
		session.generation++;
		const currentGate = reviews.pause();
		const current = actions.rejectDrawio(testSuggestionId(2));
		await currentGate.started;
		oldGate.release();
		const obsoleteResult = await old;
		const currentRunning = actions.running;
		currentGate.release();
		const currentResult = await current;
		expect({
			obsoleteResult,
			currentRunning,
			currentResult,
			running: actions.running,
			error: actions.lastError
		}).toEqual({
			obsoleteResult: undefined,
			currentRunning: true,
			currentResult: {
				...reviews.suggestion,
				id: testSuggestionId(2),
				status: 'rejected',
				decidedAt: testNow
			},
			running: false,
			error: undefined
		});
	}
);
it.each(['account', 'generation'] as const)(
	'discards an old %s rejection failure without clearing the replacement review',
	async (replacement) => {
		const { actions, reviews, session } = setup();
		reviews.failure = new Error('Old rejection failed');
		const oldGate = reviews.pause();
		const old = actions.rejectDrawio(testSuggestionId());
		await oldGate.started;
		if (replacement === 'account') session.accountId = 'replacement-review';
		session.generation++;
		reviews.failure = null;
		const currentGate = reviews.pause();
		const current = actions.rejectDrawio(testSuggestionId(2));
		await currentGate.started;
		oldGate.release();
		const obsoleteResult = await old;
		const currentRunning = actions.running;
		currentGate.release();
		await current;
		expect({
			obsoleteResult,
			currentRunning,
			running: actions.running,
			error: actions.lastError
		}).toEqual({
			obsoleteResult: undefined,
			currentRunning: true,
			running: false,
			error: undefined
		});
	}
);
it('reports a current review failure and releases its running state', async () => {
	const { actions, reviews } = setup();
	reviews.failure = new Error('Review transport unavailable');
	const result = await actions.rejectDrawio(testSuggestionId());
	expect({ result, running: actions.running, error: actions.lastError }).toEqual({
		result: undefined,
		running: false,
		error: 'Review transport unavailable'
	});
});

it('reports an accepted artifact that does not match the reviewed draw.io diagram', async () => {
	const { actions, reviews } = setup();
	reviews.artifact = diagramBuilder();
	const result = await actions.acceptDrawio(
		testNoteId(),
		testSuggestionId(),
		reviews.diagram.source,
		reviews.diagram.renderedSvg
	);
	expect({ result, running: actions.running, error: actions.lastError }).toEqual({
		result: undefined,
		running: false,
		error: 'The accepted suggestion did not create the expected draw.io diagram.'
	});
});
it('does not submit a review without an active account', async () => {
	const { actions, reviews, session } = setup();
	session.accountId = null;
	const result = await actions.rejectDrawio(testSuggestionId());
	expect({
		result,
		running: actions.running,
		error: actions.lastError,
		sent: reviews.rejectedInputs
	}).toEqual({ result: undefined, running: false, error: expect.any(String), sent: [] });
});
