import type { ActorContext } from '$lib/models/identity';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { describe, expect, it } from 'vitest';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { UserSettings, type UserSettingsDependencies } from './controller';
import { InMemoryUserPreferencesRepository } from '$lib/testing/identity/fakes/in-memory-user-preferences';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const setup = (
	viewer: ActorContext = testActor(),
	table?: InMemoryUserPreferencesRepository['byUser']
) => {
	const preferences = new InMemoryUserPreferencesRepository(viewer, table);
	const controller = new UserSettings(
		viewer,
		new WorkspaceCommandRulesService(),
		capabilityDependencies<UserSettingsDependencies>({ preferences })
	);
	return { preferences, controller };
};

describe('User document preferences', () => {
	it('reads every setting as unset when nothing was ever stored', async () => {
		const { controller } = setup();
		const preferences = await controller.getPreferences();
		expect(preferences.sectionNumberingDefault).toBeUndefined();
	});

	it('returns the effect of a write without a second read', async () => {
		const { controller } = setup();
		const preferences = await controller.updatePreferences({
			sectionNumberingDefault: true
		});
		expect(preferences.sectionNumberingDefault).toBe(true);
	});

	it('keeps users’ preferences apart', async () => {
		const { controller, preferences } = setup();
		await setup(testActor(2), preferences.byUser).controller.updatePreferences({
			sectionNumberingDefault: true
		});
		expect((await controller.getPreferences()).sectionNumberingDefault).toBeUndefined();
	});
});
