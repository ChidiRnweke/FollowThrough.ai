import { describe, expect, it } from 'vitest';
import type { PromiseCandidate } from '$lib/models/todos';
import type { TextSelection } from '$lib/models/notes';
import { Todos, type TodosDependencies } from './controller';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemoryTodos } from '$lib/testing/todos/fakes/in-memory-todos';
import {
	InMemoryPromiseExtractor,
	InMemoryProvenanceRecorder,
	InMemoryTrustPolicyEvaluator
} from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const selection: TextSelection = {
	noteId: testNoteId(),
	revision: 1,
	from: 0,
	to: 20,
	text: 'I will send it soon.'
};

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

const setup = () => {
	const content = new InMemoryNoteContent();
	const extractor = new InMemoryPromiseExtractor();
	const provenance = new InMemoryProvenanceRecorder();
	const suggestions = new InMemorySuggestions();
	const trust = new InMemoryTrustPolicyEvaluator();
	const todos = new InMemoryTodos();
	content.notes = [noteBuilder({ plainText: selection.text })];
	const controller = new Todos(
		capabilityDependencies<TodosDependencies>({
			anchorCreator: content,
			promiseExtractor: extractor,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			trustPolicyEvaluator: trust,
			todoCreator: todos,
			suggestionAccepter: suggestions,
			noteReader: content,
			transactionRunner: new InMemoryTransactionRunner([content, provenance, suggestions, todos])
		})
	);
	return { content, extractor, provenance, suggestions, trust, todos, controller };
};

describe('Promise extraction orchestration invariants', () => {
	it('creates one suggestion for each extracted promise', async () => {
		const { extractor, controller } = setup();
		extractor.candidates = [candidate('Send it'), candidate('Review it')];
		const result = await controller.extractPromises(testActor(), { selection });
		expect(result.suggestions).toHaveLength(2);
	});

	it('preserves extracted promise order', async () => {
		const { extractor, controller } = setup();
		extractor.candidates = [candidate('Send it'), candidate('Review it')];
		const result = await controller.extractPromises(testActor(), { selection });
		expect(
			result.suggestions.map((item) => (item.kind === 'todo' ? item.payload.title : ''))
		).toEqual(['Send it', 'Review it']);
	});

	it('creates a todo when the pipeline trust policy authorizes it', async () => {
		const { extractor, trust, controller } = setup();
		extractor.candidates = [candidate('Send it')];
		trust.autoAccept = true;
		const result = await controller.extractPromises(testActor(), { selection });
		expect(result.createdTodos).toHaveLength(1);
	});

	it('leaves a todo pending when the pipeline is not trusted', async () => {
		const { extractor, controller } = setup();
		extractor.candidates = [candidate('Send it')];
		const result = await controller.extractPromises(testActor(), { selection });
		expect(result.createdTodos).toEqual([]);
	});

	it('scopes an auto-created todo to the source note project', async () => {
		const { extractor, trust, controller } = setup();
		extractor.candidates = [candidate('Send it')];
		trust.autoAccept = true;
		const result = await controller.extractPromises(testActor(), { selection });
		expect(result.createdTodos[0]?.projectId).toBe(testProjectId());
	});

	it('records pipeline provenance against the selection anchor', async () => {
		const { extractor, provenance, controller } = setup();
		extractor.candidates = [candidate('Send it')];
		const result = await controller.extractPromises(testActor(), { selection });
		expect(provenance.records[0]?.sourceAnchorId).toBe(result.anchorId);
	});

	it('marks an auto-created todo with its AI provenance', async () => {
		const { extractor, trust, controller } = setup();
		extractor.candidates = [candidate('Send it')];
		trust.autoAccept = true;
		const result = await controller.extractPromises(testActor(), { selection });
		expect(result.createdTodos[0]?.provenanceId).toBe(result.suggestions[0]?.provenanceId);
	});
});

describe('Promise extraction transaction invariants', () => {
	it('rolls back a created todo when suggestion acceptance fails', async () => {
		const { extractor, suggestions, trust, todos, controller } = setup();
		extractor.candidates = [candidate('Send it')];
		trust.autoAccept = true;
		suggestions.failAcceptance = true;
		try {
			await controller.extractPromises(testActor(), { selection });
		} catch {
			// The restored todo collection is the invariant under test.
		}
		expect(todos.todos).toEqual([]);
	});

	it('rolls back the selection anchor when suggestion acceptance fails', async () => {
		const { content, extractor, suggestions, trust, controller } = setup();
		extractor.candidates = [candidate('Send it')];
		trust.autoAccept = true;
		suggestions.failAcceptance = true;
		try {
			await controller.extractPromises(testActor(), { selection });
		} catch {
			// The restored anchor collection is the invariant under test.
		}
		expect(content.anchors).toEqual([]);
	});
});
