import { describe, expect, it } from 'vitest';
import type { InlineSuggestionRequest } from '$lib/models/agent';
import { inlineSuggestionFixture } from '$lib/testing/inline-suggestions/fixtures/context';
import { InMemoryOperationObserver } from '$lib/testing/telemetry/fakes/in-memory-operation-observer';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

const actor = testActor();
const request: InlineSuggestionRequest = {
	requestId: '00000000-0000-4000-8000-000000000001',
	noteId: testNoteId(),
	revision: 1,
	blockType: 'paragraph',
	headingPath: [],
	currentSection: 'The migration needs more',
	prefix: 'The migration needs more',
	suffix: ''
};
const setup = () => {
	const observer = new InMemoryOperationObserver();
	const fixture = inlineSuggestionFixture({ observer });
	fixture.notes.notes = [noteBuilder()];
	return { ...fixture, observer };
};

describe('inline completion ownership', () => {
	it('uses the environment default when the user has no selected model', async () => {
		const fixture = setup();
		await fixture.controller.suggest(actor, request, new AbortController().signal);
		expect(fixture.generator.requests.map((r) => r.model)).toEqual(['default-inline-model']);
	});
	it('normalizes the preference model and forwards the request cancellation signal', async () => {
		const fixture = setup();
		await fixture.preferences.persist(actor, {
			...(await fixture.preferences.get(actor)),
			inlineModel: 'provider:chosen-model'
		});
		const signal = new AbortController().signal;
		await fixture.controller.suggest(actor, request, signal);
		expect(fixture.generator.requests.map((r) => ({ model: r.model, signal: r.signal }))).toEqual([
			{ model: 'provider/chosen-model', signal }
		]);
	});
	it('publishes the completion with the grounding it used', async () => {
		const fixture = setup();
		fixture.generator.text = ' replicas. Then fail over.';
		expect(await fixture.controller.suggest(actor, request, new AbortController().signal)).toEqual({
			outcome: 'suggested',
			text: ' replicas. Then fail over.',
			grounding: { currentNote: true, userMemoryCount: 0, projectPassageCount: 0 }
		});
	});
	it('reports an empty completion as no suggestion', async () => {
		const fixture = setup();
		fixture.generator.text = '';
		expect(await fixture.controller.suggest(actor, request, new AbortController().signal)).toEqual({
			outcome: 'no_suggestion',
			reason: 'empty_model'
		});
	});
	it('propagates a completion failure and releases admission', async () => {
		const fixture = setup();
		fixture.generator.failure = new Error('Inline completion provider failed');
		const outcome = await fixture.controller
			.suggest(actor, request, new AbortController().signal)
			.then(
				(result) => result.outcome,
				(error) => error.message
			);
		expect({ outcome, inFlight: fixture.admissions.hasRequest(actor.userId) }).toEqual({
			outcome: 'Inline completion provider failed',
			inFlight: false
		});
	});
	it('preserves cancellation errors and releases admission after a provider abort', async () => {
		const fixture = setup();
		const abort = new AbortController();
		const failure = new DOMException('stale caret', 'AbortError');
		// Abort when generation starts, after context retrieval has completed.
		const observer = fixture.observer;
		const cancelling = inlineSuggestionFixture({
			observer: {
				run: (name, context, body, output, attributes) => {
					if (name === 'inline.generate') abort.abort();
					return observer.run(name, context, body, output, attributes);
				}
			}
		});
		cancelling.notes.notes = [noteBuilder()];
		cancelling.generator.failure = failure;
		const outcome = await cancelling.controller.suggest(actor, request, abort.signal).then(
			(result) => result,
			(error) => error
		);
		expect({ outcome, inFlight: cancelling.admissions.hasRequest(actor.userId) }).toEqual({
			outcome: failure,
			inFlight: false
		});
	});
});
