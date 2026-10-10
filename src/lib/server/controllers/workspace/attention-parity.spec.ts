import { createWorkspaceViews } from '$lib/factories/workspace/views';
import { resourceDataSchemas, type WorkspaceRecord } from '$lib/models/workspace-records';
import { createSkillServices } from '$lib/server/factories/capabilities/skills-capability-factory';
import { UserDirectory } from '$lib/server/services/identity/users';
import { MemoryPresentationService } from '$lib/services/memory/presentation';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { TodayPresentationService } from '$lib/services/workspace/today';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { builtInSkillsFixture } from '$lib/testing/skills/fixtures/built-ins';
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
import { expect, it } from 'vitest';
import { Workspace, type WorkspaceDependencies } from './controller';

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
	const browser = createWorkspaceViews(
		new Map(records.map((record) => [JSON.stringify([record.type, record.value.id]), record]))
	);
	// The SQL suggestion read excludes the archived project; the cache retains its raw row.
	suggestions.suggestions = suggestions.suggestions.filter(
		(suggestion) => suggestion.id !== testSuggestionId(3)
	);
	const server = new Workspace(
		new TodayPresentationService(),
		capabilityDependencies<WorkspaceDependencies>({
			...agentToolResultsFixture(),
			todoPresentation: new TodoPresentationService(),
			memoryPresentation: new MemoryPresentationService(),
			...builtInSkillsFixture(),
			userReader: new UserDirectory(users),
			projectLister: projects,
			noteTreeReader: new InMemoryNoteContent(),
			suggestionLister: suggestions,
			suggestionExpirer: suggestions,
			skillFinder: createSkillServices(
				new InMemorySkillRepository(new InMemoryNoteRepository()),
				new InMemoryNoteRepository(),
				new InMemoryProvenanceRepository()
			).finder
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
