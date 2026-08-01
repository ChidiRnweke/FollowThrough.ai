import { describe, expect, it } from 'vitest';
import { ValidationError } from '$lib/errors';
import { InMemoryToolPreferenceRepository } from '$lib/testing/agent/fakes/in-memory-tool-preferences';
import { testActor, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
import { ToolAccess, type ToolCatalog } from './preferences';

const catalog: ToolCatalog = {
	entries: () => [
		{
			name: 'archive_project',
			description: 'Archive a project.',
			classification: 'mutation',
			locked: false
		},
		{ name: 'list_todos', description: 'List todos.', classification: 'read', locked: false },
		{ name: 'load_skill', description: 'Load a skill.', classification: 'read', locked: true }
	]
};

const store = () =>
	((repository) => ({ repository, store: new ToolAccess(repository, catalog) }))(
		new InMemoryToolPreferenceRepository()
	);

const stateOf = (
	view: readonly { name: string; enabled: boolean; source: string }[],
	name: string
) => view.find((preference) => preference.name === name)!;

describe('Tool preference resolution', () => {
	it('enables a tool nobody has touched', async () => {
		const { store: preferences } = store();
		expect(stateOf(await preferences.view(testActor()), 'archive_project').enabled).toBe(true);
	});

	it('reports an untouched tool as following the default', async () => {
		const { store: preferences } = store();
		expect(stateOf(await preferences.view(testActor()), 'archive_project').source).toBe('default');
	});

	it('disables a tool the user turned off', async () => {
		const { store: preferences } = store();
		await preferences.setEnabled(testActor(), { toolName: 'archive_project', enabled: false });
		expect(stateOf(await preferences.view(testActor()), 'archive_project').enabled).toBe(false);
	});

	it('lets a project override re-enable a tool the user turned off', async () => {
		const { store: preferences } = store();
		await preferences.setEnabled(testActor(), { toolName: 'archive_project', enabled: false });
		await preferences.setEnabled(testActor(), {
			toolName: 'archive_project',
			enabled: true,
			projectId: testProjectId()
		});
		expect(
			stateOf(await preferences.view(testActor(), testProjectId()), 'archive_project').enabled
		).toBe(true);
	});

	it('attributes an overridden tool to the project', async () => {
		const { store: preferences } = store();
		await preferences.setEnabled(testActor(), {
			toolName: 'archive_project',
			enabled: false,
			projectId: testProjectId()
		});
		expect(
			stateOf(await preferences.view(testActor(), testProjectId()), 'archive_project').source
		).toBe('project');
	});

	it('leaves other projects alone when one is overridden', async () => {
		const { store: preferences } = store();
		await preferences.setEnabled(testActor(), {
			toolName: 'archive_project',
			enabled: false,
			projectId: testProjectId()
		});
		expect(stateOf(await preferences.view(testActor()), 'archive_project').enabled).toBe(true);
	});

	it('restores the workspace default when an override is cleared', async () => {
		const { store: preferences } = store();
		await preferences.setEnabled(testActor(), { toolName: 'archive_project', enabled: false });
		await preferences.setEnabled(testActor(), {
			toolName: 'archive_project',
			enabled: true,
			projectId: testProjectId()
		});
		await preferences.clearOverride(testActor(), testProjectId(), 'archive_project');
		expect(
			stateOf(await preferences.view(testActor(), testProjectId()), 'archive_project').enabled
		).toBe(false);
	});

	it('keeps a locked tool enabled even when a row says otherwise', async () => {
		const { repository, store: preferences } = store();
		await repository.upsertForUser(testActor(), { toolName: 'load_skill', enabled: false });
		expect(stateOf(await preferences.view(testActor()), 'load_skill').enabled).toBe(true);
	});

	it('refuses to store a preference for a locked tool', async () => {
		const { store: preferences } = store();
		await expect(
			preferences.setEnabled(testActor(), { toolName: 'load_skill', enabled: false })
		).rejects.toThrow(ValidationError);
	});

	it('refuses to store a preference for a tool that does not exist', async () => {
		const { store: preferences } = store();
		await expect(
			preferences.setEnabled(testActor(), { toolName: 'summon_kraken', enabled: false })
		).rejects.toThrow(ValidationError);
	});

	it('ignores a stored row naming a tool that no longer exists', async () => {
		const { repository, store: preferences } = store();
		await repository.upsertForUser(testActor(), { toolName: 'retired_tool', enabled: false });
		expect((await preferences.view(testActor())).map((preference) => preference.name)).toEqual([
			'archive_project',
			'list_todos',
			'load_skill'
		]);
	});

	it('resolves a disabled tool to a policy that rejects it', async () => {
		const { store: preferences } = store();
		await preferences.setEnabled(testActor(), { toolName: 'archive_project', enabled: false });
		expect((await preferences.resolve(testActor())).isEnabled('archive_project')).toBe(false);
	});

	it('resolves an unknown tool name to enabled', async () => {
		const { store: preferences } = store();
		expect((await preferences.resolve(testActor())).isEnabled('added_tomorrow')).toBe(true);
	});
});
