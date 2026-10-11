import type { ResolvedToolCatalogEntry } from '$lib/models/agent/tool-catalog';
import { describe, expect, it } from 'vitest';
import { InMemoryToolPreferenceRepository } from '$lib/testing/agent/fakes/in-memory-tool-preferences';
import { testActor, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
import { ToolAccess } from './preferences';

const catalog: readonly ResolvedToolCatalogEntry[] = [
	{
		name: 'archive_project',
		description: 'Archive a project.',
		classification: 'mutation',
		locked: false
	},
	{ name: 'list_todos', description: 'List todos.', classification: 'read', locked: false },
	{ name: 'load_skill', description: 'Load a skill.', classification: 'read', locked: true }
];

const store = () =>
	((repository) => ({ repository, store: new ToolAccess(repository) }))(
		new InMemoryToolPreferenceRepository(testActor())
	);

const stateOf = (
	view: readonly { name: string; enabled: boolean; source: string }[],
	name: string
) => view.find((preference) => preference.name === name)!;

describe('Tool preference resolution', () => {
	it('enables a tool nobody has touched', async () => {
		const { store: preferences } = store();
		const state = stateOf(await preferences.view(catalog), 'archive_project');
		expect({ enabled: state.enabled, source: state.source }).toEqual({
			enabled: true,
			source: 'default'
		});
	});

	it('lets a project override re-enable a tool the user turned off', async () => {
		const { store: preferences } = store();
		await preferences.setEnabled(catalog, {
			toolName: 'archive_project',
			enabled: false
		});
		await preferences.setEnabled(catalog, {
			toolName: 'archive_project',
			enabled: true,
			projectId: testProjectId()
		});
		expect(
			stateOf(await preferences.view(catalog, testProjectId()), 'archive_project').enabled
		).toBe(true);
	});

	it('attributes an overridden tool to the project', async () => {
		const { store: preferences } = store();
		await preferences.setEnabled(catalog, {
			toolName: 'archive_project',
			enabled: false,
			projectId: testProjectId()
		});
		expect(
			stateOf(await preferences.view(catalog, testProjectId()), 'archive_project').source
		).toBe('project');
	});

	it('keeps a locked tool enabled even when a row says otherwise', async () => {
		const { repository, store: preferences } = store();
		await repository.upsertForUser({ toolName: 'load_skill', enabled: false });
		expect(stateOf(await preferences.view(catalog), 'load_skill').enabled).toBe(true);
	});

	it('ignores a stored row naming a tool that no longer exists', async () => {
		const { repository, store: preferences } = store();
		await repository.upsertForUser({ toolName: 'retired_tool', enabled: false });
		expect((await preferences.view(catalog)).map((preference) => preference.name)).toEqual([
			'archive_project',
			'list_todos',
			'load_skill'
		]);
	});
});
