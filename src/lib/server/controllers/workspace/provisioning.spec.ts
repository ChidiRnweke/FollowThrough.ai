import { expect, it } from 'vitest';
import { Workspace, type WorkspaceDependencies } from './controller';
import { builtInSkillsFixture } from '$lib/testing/skills/fixtures/built-ins';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { UserDirectory } from '$lib/server/services/identity/users';
import { ProjectCatalog } from '$lib/server/services/projects/catalog';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import { InMemoryAnchorRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';
import { InMemorySuggestionReader } from '$lib/testing/suggestions/fakes/in-memory-automation';

it('returns the newly provisioned Inbox together with its skills on the first shell read', async () => {
	const state = builtInSkillsFixture();
	const users = new InMemoryUserRepository();
	await users.ensureLocal(testActor());
	const suggestions = new InMemorySuggestionReader();
	const workspace = new Workspace(
		capabilityDependencies<WorkspaceDependencies>({
			...state,
			userReader: new UserDirectory(users),
			projectLister: new ProjectCatalog(state.projects, state.projects),
			noteTreeReader: new NoteCatalog(state.notes, new InMemoryAnchorRepository(), state.projects),
			suggestionExpirer: suggestions,
			suggestionLister: suggestions
		})
	);
	const shell = await workspace.getShellContext(testActor());
	expect({
		projects: shell.projects.map((project) => project.role),
		skills: shell.skills.map((skill) => skill.name)
	}).toEqual({
		projects: ['inbox'],
		skills: ['FollowThrough', 'Settings', 'Diagramming']
	});
});
