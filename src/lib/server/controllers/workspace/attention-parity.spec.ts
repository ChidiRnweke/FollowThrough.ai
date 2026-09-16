import { expect, it } from 'vitest';
import { builtInSkillsFixture } from '$lib/testing/skills/fixtures/built-ins';
import { Workspace, type WorkspaceDependencies } from './controller';
import { WorkspaceViews } from '$lib/controllers/workspace/views';
import { resourceDataSchemas, type WorkspaceRecord } from '$lib/models/workspace-records';
import { UserDirectory } from '$lib/server/services/identity/users';
import { SkillLibrary } from '$lib/server/services/skills/library';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { InMemorySuggestionReader } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	memorySuggestionBuilder,
	projectBuilder,
	suggestionBuilder,
	testActor,
	testNow,
	testProjectId,
	testSuggestionId
} from '$lib/testing/workspace/fixtures/domain-builders';

it('shows the same profile and visible-project memory attention from server and cached facts', async () => {
	const actor = testActor();
	const users = new InMemoryUserRepository();
	await users.ensureLocal(actor);
	const projects = new InMemoryProjects();
	projects.projects = [
		projectBuilder(),
		projectBuilder({ id: testProjectId(2), archivedAt: testNow })
	];
	const suggestions = new InMemorySuggestionReader();
	suggestions.suggestions = [
		memorySuggestionBuilder(),
		...projects.projects.map((project, index) =>
			memorySuggestionBuilder({
				id: testSuggestionId(index + 2),
				payload: {
					scope: 'project',
					operation: 'add',
					content: 'Project fact',
					projectId: project.id
				}
			})
		),
		suggestionBuilder({ id: testSuggestionId(4) }),
		memorySuggestionBuilder({ id: testSuggestionId(5), status: 'accepted' })
	];
	const records = [
		...users.users.map((user) => ({
			type: 'users' as const,
			value: resourceDataSchemas.users.parse(user)
		})),
		...projects.projects.map((project) => ({
			type: 'projects' as const,
			value: resourceDataSchemas.projects.parse(project)
		})),
		...suggestions.suggestions.map((suggestion) => ({
			type: 'suggestions' as const,
			value: resourceDataSchemas.suggestions.parse(suggestion)
		}))
	] satisfies WorkspaceRecord[];
	const browser = new WorkspaceViews(
		new Map(records.map((record) => [JSON.stringify([record.type, record.value.id]), record]))
	);
	const server = new Workspace(
		capabilityDependencies<WorkspaceDependencies>({
			...builtInSkillsFixture(),
			userReader: new UserDirectory(users),
			projectLister: projects,
			noteTreeReader: new InMemoryNoteContent(),
			suggestionLister: suggestions,
			suggestionExpirer: suggestions,
			skillFinder: new SkillLibrary(
				new InMemorySkillRepository(),
				new InMemoryNoteRepository(),
				new InMemoryProvenanceRepository()
			)
		})
	);
	const actual = await server.getShellContext(actor);
	expect({
		pending: actual.pendingSuggestionCount,
		memory: actual.pendingMemoryNotifications
	}).toEqual({
		pending: browser.shell(actor.userId)?.pendingSuggestionCount,
		memory: browser.shell(actor.userId)?.pendingMemoryNotifications
	});
});
