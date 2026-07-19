import { describe, expect, it } from 'vitest';
import { DefaultSuggestionsController, type SuggestionsDependencies } from './controller';
import {
	InMemorySuggestionReader,
	InMemorySuggestions
} from '$lib/testing/fakes/in-memory-automation';
import { InMemorySuggestionArtifacts } from '$lib/testing/fakes/in-memory-artifacts';
import { InMemoryTransactionRunner } from '$lib/testing/fakes/in-memory-transaction';
import {
	suggestionBuilder,
	memorySuggestionBuilder,
	testActor,
	testProjectId,
	testSuggestionId,
	testTodoId,
	todoBuilder
} from '$lib/testing/fixtures/domain-builders';

describe('Pending memory review invariants', () => {
	it('returns only profile memory suggestions for the profile scope', async () => {
		const reader = new InMemorySuggestionReader();
		reader.suggestions = [
			memorySuggestionBuilder(),
			memorySuggestionBuilder({
				id: testSuggestionId(2),
				payload: { operation: 'add', content: 'Project rule', projectId: testProjectId() }
			}),
			suggestionBuilder({ id: testSuggestionId(3) })
		];
		const controller = new DefaultSuggestionsController({
			suggestionLister: reader,
			suggestionViewAssembler: reader
		} as unknown as SuggestionsDependencies);
		const result = await controller.listPendingMemory(testActor(), {});
		expect(result.suggestions.map((view) => view.suggestion.id)).toEqual([testSuggestionId()]);
	});

	it('returns only memory suggestions for the requested project', async () => {
		const reader = new InMemorySuggestionReader();
		reader.suggestions = [
			memorySuggestionBuilder(),
			memorySuggestionBuilder({
				id: testSuggestionId(2),
				payload: { operation: 'add', content: 'Project rule', projectId: testProjectId() }
			}),
			memorySuggestionBuilder({
				id: testSuggestionId(3),
				payload: { operation: 'add', content: 'Other project', projectId: testProjectId(2) }
			})
		];
		const controller = new DefaultSuggestionsController({
			suggestionLister: reader,
			suggestionViewAssembler: reader
		} as unknown as SuggestionsDependencies);
		const result = await controller.listPendingMemory(testActor(), { projectId: testProjectId() });
		expect(result.suggestions.map((view) => view.suggestion.id)).toEqual([testSuggestionId(2)]);
	});
});

const setup = () => {
	const suggestions = new InMemorySuggestions();
	const artifacts = new InMemorySuggestionArtifacts();
	const transactionRunner = new InMemoryTransactionRunner([suggestions, artifacts]);
	const controller = new DefaultSuggestionsController({
		suggestionFinder: suggestions,
		suggestionAccepter: suggestions,
		suggestionRejecter: suggestions,
		suggestionReverter: suggestions,
		artifactApplier: artifacts,
		transactionRunner
	} as unknown as SuggestionsDependencies);
	return {
		suggestions,
		artifacts,
		accept: controller,
		reject: controller,
		revert: controller
	};
};

describe('Suggestion lifecycle invariants', () => {
	it('accepting a proposal transitions it to accepted', async () => {
		const { suggestions, accept } = setup();
		suggestions.suggestions = [suggestionBuilder()];
		const result = await accept.accept(testActor(), { suggestionId: testSuggestionId() });
		expect(result.suggestion.status).toBe('accepted');
	});

	it('accepting a proposal applies its artifact', async () => {
		const { suggestions, artifacts, accept } = setup();
		suggestions.suggestions = [suggestionBuilder()];
		await accept.accept(testActor(), { suggestionId: testSuggestionId() });
		expect(artifacts.artifacts.map((artifact) => artifact.title)).toEqual(['Send the design']);
	});

	it('rejecting a proposal transitions it to rejected', async () => {
		const { suggestions, reject } = setup();
		suggestions.suggestions = [suggestionBuilder()];
		const result = await reject.reject(testActor(), { suggestionId: testSuggestionId() });
		expect(result.status).toBe('rejected');
	});

	it('rejecting a proposal does not apply an artifact', async () => {
		const { suggestions, artifacts, reject } = setup();
		suggestions.suggestions = [suggestionBuilder()];
		await reject.reject(testActor(), { suggestionId: testSuggestionId() });
		expect(artifacts.artifacts).toEqual([]);
	});

	it('an expired proposal cannot be accepted', async () => {
		const { suggestions, accept } = setup();
		suggestions.suggestions = [
			suggestionBuilder({ expiresAt: '2020-01-01T00:00:00.000Z' as never })
		];
		await expect(
			accept.accept(testActor(), { suggestionId: testSuggestionId() })
		).rejects.toMatchObject({ code: 'EXPIRED_SUGGESTION' });
	});

	it('an accepted suggestion can be reverted', async () => {
		const { suggestions, artifacts, revert } = setup();
		suggestions.suggestions = [
			suggestionBuilder({
				status: 'accepted',
				appliedArtifactId: testTodoId()
			})
		];
		artifacts.artifacts = [todoBuilder()];
		const result = await revert.revert(testActor(), { suggestionId: testSuggestionId() });
		expect(result.status).toBe('reverted');
	});

	it('reverting removes the applied artifact', async () => {
		const { suggestions, artifacts, revert } = setup();
		suggestions.suggestions = [
			suggestionBuilder({
				status: 'accepted',
				appliedArtifactId: testTodoId()
			})
		];
		artifacts.artifacts = [todoBuilder()];
		await revert.revert(testActor(), { suggestionId: testSuggestionId() });
		expect(artifacts.artifacts).toEqual([]);
	});
});

describe('Suggestion transaction invariants', () => {
	it('reports an acceptance persistence failure as an external-service error', async () => {
		const { suggestions, accept } = setup();
		suggestions.suggestions = [suggestionBuilder()];
		suggestions.failAcceptance = true;
		await expect(
			accept.accept(testActor(), { suggestionId: testSuggestionId() })
		).rejects.toMatchObject({ code: 'EXTERNAL_SERVICE' });
	});

	it('rolls back an artifact when acceptance persistence fails', async () => {
		const { suggestions, artifacts, accept } = setup();
		suggestions.suggestions = [suggestionBuilder()];
		suggestions.failAcceptance = true;
		try {
			await accept.accept(testActor(), { suggestionId: testSuggestionId() });
		} catch {
			// The invariant under test is the restored state.
		}
		expect(artifacts.artifacts).toEqual([]);
	});

	it('keeps an accepted suggestion when artifact revert fails', async () => {
		const { suggestions, artifacts, revert } = setup();
		suggestions.suggestions = [
			suggestionBuilder({
				status: 'accepted',
				appliedArtifactId: testTodoId()
			})
		];
		artifacts.artifacts = [todoBuilder()];
		artifacts.failRevert = true;
		try {
			await revert.revert(testActor(), { suggestionId: testSuggestionId() });
		} catch {
			// The invariant under test is the restored state.
		}
		expect(suggestions.suggestions[0]?.status).toBe('accepted');
	});
});
