import { describe, expect, it } from 'vitest';
import type { DateTime } from '$lib/models';
import { InMemorySuggestions } from '$lib/testing/fakes/in-memory-automation';
import {
	suggestionBuilder,
	testActor,
	testNow,
	testSuggestionId
} from '$lib/testing/fixtures/domain-builders';
import { SuggestionExpiryService } from './suggestion-expiry';

const clock = { now: () => testNow };

describe('Suggestion expiry invariants', () => {
	it('transitions a proposed suggestion whose expiry has passed', async () => {
		const store = new InMemorySuggestions();
		store.suggestions = [suggestionBuilder({ expiresAt: '2026-07-11T08:00:00.000Z' as DateTime })];
		await new SuggestionExpiryService(store, clock).expire(testActor());
		expect(store.suggestions[0]?.status).toBe('expired');
	});

	it('does not expire a future suggestion', async () => {
		const store = new InMemorySuggestions();
		store.suggestions = [suggestionBuilder({ expiresAt: '2026-07-12T08:00:00.000Z' as DateTime })];
		await new SuggestionExpiryService(store, clock).expire(testActor());
		expect(store.suggestions[0]?.status).toBe('proposed');
	});

	it('does not expire another actor’s suggestion', async () => {
		const store = new InMemorySuggestions();
		store.suggestions = [
			suggestionBuilder({
				id: testSuggestionId(2),
				userId: testActor(2).userId,
				expiresAt: '2026-07-11T08:00:00.000Z' as DateTime
			})
		];
		await new SuggestionExpiryService(store, clock).expire(testActor());
		expect(store.suggestions[0]?.status).toBe('proposed');
	});

	it('is idempotent after the transition', async () => {
		const store = new InMemorySuggestions();
		store.suggestions = [suggestionBuilder({ expiresAt: '2026-07-11T08:00:00.000Z' as DateTime })];
		const service = new SuggestionExpiryService(store, clock);
		await service.expire(testActor());
		const transitioned = await service.expire(testActor());
		expect(transitioned).toBe(0);
	});
});
