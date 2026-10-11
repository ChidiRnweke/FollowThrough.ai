import { describe, expect, it } from 'vitest';
import { UserPreferenceStore } from './user-preferences';
import { InMemoryUserPreferencesRepository } from '$lib/testing/identity/fakes/in-memory-user-preferences';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

describe('Storing user preferences', () => {
	it('reads an unset preference as absent rather than off', async () => {
		const store = new UserPreferenceStore(new InMemoryUserPreferencesRepository(testActor()));
		const preferences = await store.get();
		expect(preferences.sectionNumberingDefault).toBeUndefined();
	});

	it('reads back what a write stored', async () => {
		const store = new UserPreferenceStore(new InMemoryUserPreferencesRepository(testActor()));
		await store.update({ sectionNumberingDefault: true });
		const preferences = await store.get();
		expect(preferences.sectionNumberingDefault).toBe(true);
	});
});
