import { describe, expect, it } from 'vitest';
import { suggestionSchema } from './index';
import {
	suggestionBuilder,
	testNow,
	testTodoId
} from '$lib/testing/workspace/fixtures/domain-builders';
describe('Suggestion lifecycle payloads', () => {
	it('requires an artifact for an accepted suggestion', () => {
		expect(
			suggestionSchema.safeParse({ ...suggestionBuilder(), status: 'accepted', decidedAt: testNow })
				.success
		).toBe(false);
	});
	it('requires a decision time for an accepted suggestion', () => {
		expect(
			suggestionSchema.safeParse({
				...suggestionBuilder(),
				status: 'accepted',
				appliedArtifactId: testTodoId()
			}).success
		).toBe(false);
	});
	it('does not allow a pending suggestion to claim an applied artifact', () => {
		expect(
			suggestionSchema.safeParse({ ...suggestionBuilder(), appliedArtifactId: testTodoId() })
				.success
		).toBe(false);
	});
});
