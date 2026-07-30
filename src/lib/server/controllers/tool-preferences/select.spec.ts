import { describe, expect, it } from 'vitest';
import { ValidationError } from '$lib/errors';
import { ToolAccess, type ToolCatalog } from '$lib/server/services';
import { InMemoryToolPreferenceRepository } from '$lib/testing/fakes/in-memory-tool-preferences';
import { testActor, testProjectId } from '$lib/testing/fixtures/domain-builders';
import { ToolPreferences } from './controller';

const catalog: ToolCatalog = {
	entries: () => [
		{
			name: 'archive_project',
			description: 'Archive a project.',
			classification: 'mutation',
			locked: false
		},
		{ name: 'load_skill', description: 'Load a skill.', classification: 'read', locked: true }
	]
};

const controller = () =>
	new ToolPreferences({
		preferences: new ToolAccess(new InMemoryToolPreferenceRepository(), catalog)
	});

const stateOf = (view: readonly { name: string; enabled: boolean }[], name: string) =>
	view.find((preference) => preference.name === name)!;

describe('Selecting tools', () => {
	it('lists every tool in the catalog', async () => {
		expect(await controller().list(testActor())).toHaveLength(2);
	});

	it('returns the tool as disabled after turning it off', async () => {
		const view = await controller().setEnabled(testActor(), {
			toolName: 'archive_project',
			enabled: false
		});
		expect(stateOf(view, 'archive_project').enabled).toBe(false);
	});

	it('scopes a project override to that project', async () => {
		const tools = controller();
		await tools.setEnabled(testActor(), {
			toolName: 'archive_project',
			enabled: false,
			projectId: testProjectId()
		});
		expect(stateOf(await tools.list(testActor()), 'archive_project').enabled).toBe(true);
	});

	it('restores the workspace default when an override is cleared', async () => {
		const tools = controller();
		await tools.setEnabled(testActor(), {
			toolName: 'archive_project',
			enabled: false,
			projectId: testProjectId()
		});
		const view = await tools.clearOverride(testActor(), {
			toolName: 'archive_project',
			projectId: testProjectId()
		});
		expect(stateOf(view, 'archive_project').enabled).toBe(true);
	});

	it('refuses to turn off a locked tool', async () => {
		await expect(
			controller().setEnabled(testActor(), { toolName: 'load_skill', enabled: false })
		).rejects.toThrow(ValidationError);
	});

	it('refuses a tool name that does not exist', async () => {
		await expect(
			controller().setEnabled(testActor(), { toolName: 'summon_kraken', enabled: false })
		).rejects.toThrow(ValidationError);
	});
});
