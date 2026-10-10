import { describe, expect, it } from 'vitest';
import {
	OpenInferenceSpanKind,
	SemanticConventions as S
} from '@arizeai/openinference-semantic-conventions';
import type { InlineSuggestionRequest } from '$lib/models/agent';
import { inlineSuggestionFixture } from '$lib/testing/inline-suggestions/fixtures/context';
import { inlineCompletionProvider } from '$lib/testing/inline-suggestions/fixtures/provider';
import { InMemoryOperationObserver } from '$lib/testing/telemetry/fakes/in-memory-operation-observer';
import { createInlineCompletion } from '$lib/server/factories/inline-completion';
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
	it('sanitizes raw provider text before publishing a suggestion', async () => {
		const fixture = setup();
		fixture.generator.text = '" replicas. Then fail over. Third sentence."';
		expect(await fixture.controller.suggest(actor, request, new AbortController().signal)).toEqual({
			outcome: 'suggested',
			text: ' replicas. Then fail over.',
			grounding: { currentNote: true, userMemoryCount: 0, projectPassageCount: 0 }
		});
	});
	it('reports empty sanitized text as no suggestion', async () => {
		const fixture = setup();
		fixture.generator.text = '   ';
		expect(await fixture.controller.suggest(actor, request, new AbortController().signal)).toEqual({
			outcome: 'no_suggestion',
			reason: 'empty_model'
		});
	});
	it('records the provider failure before normalizing the operation error', async () => {
		const fixture = setup();
		fixture.generator.failure = new Error('provider down');
		const outcome = await fixture.controller
			.suggest(actor, request, new AbortController().signal)
			.then(
				(result) => result.outcome,
				(error) => error.message
			);
		expect({
			outcome,
			trace: fixture.observer.operations.filter((event) => event.name === 'inline.generate')
		}).toMatchObject({
			outcome: 'Inline completion provider failed',
			trace: [
				{
					kind: 'failed',
					error: 'provider down',
					context: { metadata: { model: 'default-inline-model' } }
				}
			]
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
		expect({ outcome, admission: cancelling.admission.admit(actor.userId) }).toEqual({
			outcome: failure,
			admission: { allowed: true }
		});
	});
	it('retains raw provider attributes and sanitized output in the generation span', async () => {
		const provider = await inlineCompletionProvider(
			JSON.stringify({
				model: 'provider-model',
				choices: [{ message: { content: '" replicas."' }, finish_reason: 'stop' }]
			})
		);
		try {
			const observer = new InMemoryOperationObserver();
			const fixture = inlineSuggestionFixture({
				observer,
				inlineCompletionGenerator: createInlineCompletion({
					apiKey: 'local-key',
					baseURL: provider.baseURL,
					appURL: 'https://followthrough.example'
				})
			});
			fixture.notes.notes = [noteBuilder()];
			await fixture.controller.suggest(actor, request, new AbortController().signal);
			expect(observer.operations.filter((event) => event.name === 'inline.generate')).toMatchObject(
				[
					{
						kind: 'completed',
						output: ' replicas.',
						context: {
							kind: OpenInferenceSpanKind.LLM,
							metadata: { model: 'default-inline-model' },
							tags: ['inline', 'generation']
						},
						attributes: {
							[S.LLM_MODEL_NAME]: 'provider-model',
							'llm.output_messages.0.message.content': '" replicas."'
						}
					}
				]
			);
		} finally {
			await provider.close();
		}
	});
});
