import { describe, expect, it } from 'vitest';
import { Suggestions, type SuggestionsDependencies } from './controller';
import { InMemorySuggestionReader } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	memorySuggestionBuilder,
	testActor,
	testNow,
	testSuggestionId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const proposals = new InMemorySuggestionReader();
	proposals.suggestions = [
		memorySuggestionBuilder({ expiresAt: testNow }),
		memorySuggestionBuilder({ id: testSuggestionId(2) }),
		memorySuggestionBuilder({
			id: testSuggestionId(3),
			userId: testActor(2).userId,
			expiresAt: testNow
		})
	];
	const controller = new Suggestions(
		capabilityDependencies<SuggestionsDependencies>({
			suggestionExpirer: proposals,
			suggestionLister: proposals,
			suggestionViewAssembler: proposals
		})
	);
	return { controller, proposals };
};

describe('proposal expiry during review', () => {
	it.each(['proposed', 'expired'] as const)(
		'returns current %s proposals after expiry',
		async (status) => {
			const { controller } = setup();
			const result = await controller.list(testActor(), { status });
			expect(
				result.groups.flatMap((group) => group.suggestions.map((view) => view.suggestion.id))
			).toEqual([testSuggestionId(status === 'proposed' ? 2 : 1)]);
		}
	);
	it('excludes expired profile memory from pending review', async () => {
		const { controller } = setup();
		const result = await controller.listPendingMemory(testActor(), {});
		expect(result.suggestions.map((view) => view.suggestion.id)).toEqual([testSuggestionId(2)]);
	});
	it('leaves another account’s expiring proposal unchanged', async () => {
		const { controller, proposals } = setup();
		await controller.list(testActor(), { status: 'proposed' });
		expect(
			proposals.suggestions.find((proposal) => proposal.id === testSuggestionId(3))?.status
		).toBe('proposed');
	});
	it('reports expiry failure instead of returning stale pending counts', async () => {
		const { controller, proposals } = setup();
		proposals.expiryFailure = new Error('Expiry storage is unavailable');
		await expect(controller.listPendingMemory(testActor(), {})).rejects.toThrow(
			'Expiry storage is unavailable'
		);
	});
});
