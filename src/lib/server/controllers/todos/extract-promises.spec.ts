import { describe, expect, it } from 'vitest';
import type { PromiseCandidate } from '$lib/models/todos';
import {
	promiseExtractionFixture as setup,
	promiseSelection as selection
} from '$lib/testing/todos/fixtures/promise-extraction';
import { testActor, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';

const candidate = (
	action: string,
	overrides: Partial<PromiseCandidate> = {}
): PromiseCandidate => ({
	action,
	responsibility: 'mine',
	strength: 'explicit',
	confidence: 95,
	...overrides
});

describe('Promise extraction orchestration invariants', () => {
	it.each([false, true])(
		'preserves the extracted owner when automatic acceptance is %s',
		async (autoAccept) => {
			const { content, extractor, trust, controller } = setup();
			const text = 'Maya will send the draft.';
			content.notes[0] = {
				...content.notes[0],
				plainText: text,
				document: {
					type: 'doc',
					content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
				}
			};
			extractor.candidates = [
				candidate('Send the draft', { responsibility: 'waiting_on', ownerName: 'Maya' })
			];
			trust.autoAccept = autoAccept;
			const result = await controller.extractPromises(testActor(), {
				selection: { ...selection, text, to: text.length }
			});
			expect({
				proposals: result.suggestions.map((item) => item.payload.waitingOn),
				tasks: result.createdTodos.map((todo) => todo.waitingOn)
			}).toEqual({ proposals: ['Maya'], tasks: autoAccept ? ['Maya'] : [] });
		}
	);

	it('does not use the current user’s extracted name as a waiting-on party', async () => {
		const { extractor, trust, controller } = setup();
		extractor.candidates = [candidate('Send the draft', { ownerName: 'I' })];
		trust.autoAccept = true;
		const result = await controller.extractPromises(testActor(), { selection });
		expect({
			proposal: result.suggestions[0].payload.waitingOn,
			task: result.createdTodos[0].waitingOn
		}).toEqual({ proposal: undefined, task: undefined });
	});

	it('preserves extracted promise order', async () => {
		const { extractor, controller } = setup();
		extractor.candidates = [candidate('Send it'), candidate('Review it')];
		const result = await controller.extractPromises(testActor(), { selection });
		expect(
			result.suggestions.map((item) => (item.kind === 'todo' ? item.payload.title : ''))
		).toEqual(['Send it', 'Review it']);
	});

	it('limits suggestions to the requested responsibility', async () => {
		const { extractor, controller } = setup();
		extractor.candidates = [
			candidate('Clean up the runbook'),
			candidate('Wire the alert', { responsibility: 'waiting_on', ownerName: 'Maya' })
		];
		const result = await controller.extractPromises(testActor(), {
			selection,
			responsibility: 'mine'
		});
		expect(
			result.suggestions.map((item) => (item.kind === 'todo' ? item.payload.title : ''))
		).toEqual(['Clean up the runbook']);
	});

	it('leaves a todo pending when the pipeline is not trusted', async () => {
		const { extractor, provenance, controller } = setup();
		extractor.candidates = [candidate('Send it')];
		const result = await controller.extractPromises(testActor(), { selection });
		expect({
			createdTodos: result.createdTodos,
			status: result.suggestions[0]?.status,
			anchor: provenance.records[0]?.sourceAnchorId
		}).toEqual({ createdTodos: [], status: 'proposed', anchor: result.anchorId });
	});

	it('returns accepted status and the created task identity', async () => {
		const { extractor, trust, controller } = setup();
		extractor.candidates = [candidate('Send it')];
		trust.autoAccept = true;
		const result = await controller.extractPromises(testActor(), { selection });
		expect(result.suggestions[0]).toMatchObject({
			status: 'accepted',
			appliedArtifactId: result.createdTodos[0].id,
			isAutoAccepted: true
		});
	});

	it('returns the trusted task and matching suggestion provenance', async () => {
		const { extractor, trust, controller } = setup();
		extractor.candidates = [candidate('Send it')];
		trust.autoAccept = true;
		const result = await controller.extractPromises(testActor(), { selection });
		expect({
			projectId: result.createdTodos[0]?.projectId,
			provenanceId: result.createdTodos[0]?.provenanceId,
			suggestionProvenance: result.suggestions[0]?.provenanceId
		}).toEqual({
			projectId: testProjectId(),
			provenanceId: result.suggestions[0]?.provenanceId,
			suggestionProvenance: result.suggestions[0]?.provenanceId
		});
	});
});

describe('Promise extraction transaction invariants', () => {
	it('rolls back the todo and selection anchor when suggestion acceptance fails', async () => {
		const { content, extractor, suggestions, trust, todos, controller } = setup();
		extractor.candidates = [candidate('Send it')];
		trust.autoAccept = true;
		suggestions.failAcceptance = true;
		try {
			await controller.extractPromises(testActor(), { selection });
		} catch {
			// The restored todo collection is the invariant under test.
		}
		expect({ todos: todos.todos, anchors: content.anchors }).toEqual({ todos: [], anchors: [] });
	});
});
