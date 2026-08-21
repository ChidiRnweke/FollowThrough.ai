import { describe, expect, it } from 'vitest';
import { UserSettings } from './controller';
import { InMemoryUserPreferencesRepository } from '$lib/testing/identity/fakes/in-memory-user-preferences';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const preferences = new InMemoryUserPreferencesRepository();
	const controller = new UserSettings({ preferences });
	return { preferences, controller };
};

describe('User document preferences', () => {
	it('reads every setting as unset when nothing was ever stored', async () => {
		const { controller } = setup();
		const preferences = await controller.getPreferences(testActor());
		expect(preferences.sectionNumberingDefault).toBeUndefined();
	});

	it('returns the effect of a write without a second read', async () => {
		const { controller } = setup();
		const preferences = await controller.updatePreferences(testActor(), {
			sectionNumberingDefault: true
		});
		expect(preferences.sectionNumberingDefault).toBe(true);
	});

	it('keeps users’ preferences apart', async () => {
		const { controller } = setup();
		await controller.updatePreferences(testActor(2), { sectionNumberingDefault: true });
		const preferences = await controller.getPreferences(testActor());
		expect(preferences.sectionNumberingDefault).toBeUndefined();
	});
});
