import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import { UserDirectory } from '$lib/server/services/identity/users';
import { MemoryPresentationService } from '$lib/services/memory/presentation';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { TodayPresentationService } from '$lib/services/workspace/today';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryUserRepository } from '$lib/testing/identity/fakes/in-memory-users';
import { InMemoryAnchorRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { builtInSkillsFixture } from '$lib/testing/skills/fixtures/built-ins';
import { InMemorySuggestionReader } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	memoryEntryBuilder,
	testActor,
	testMemoryEntryId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { expect, it } from 'vitest';
import { Workspace, type WorkspaceDependencies } from './controller';

const provisionedWorkspace = async (memories = new InMemoryMemoryEntryRepository(testActor())) => {
	const state = builtInSkillsFixture();
	const users = new InMemoryUserRepository(testActor());
	await users.ensureLocal();
	const suggestions = new InMemorySuggestionReader(testActor());
	const workspace = new Workspace(
		new TodayPresentationService(),
		capabilityDependencies<WorkspaceDependencies>({
			...agentToolResultsFixture(),
			todoPresentation: new TodoPresentationService(),
			memoryPresentation: new MemoryPresentationService(),
			...state,
			userReader: new UserDirectory(users),
			projectLister: createProjectServices(testActor(), state.projects, state.projects).catalog,
			noteTreeReader: createNoteServices(
				testActor(),
				state.notes,
				new InMemoryAnchorRepository(testActor()),
				state.projects,
				testClock
			).library,
			suggestionExpirer: suggestions,
			suggestionLister: suggestions,
			memoryLister: memories
		})
	);
	return workspace;
};

it('returns the newly provisioned Inbox together with its skills on the first shell read', async () => {
	const shell = await (await provisionedWorkspace()).getShellContext();
	expect({
		projects: shell.projects.map((project) => project.role),
		skills: shell.skills.map((skill) => skill.name)
	}).toEqual({
		projects: ['inbox'],
		skills: ['FollowThrough', 'Settings', 'Diagramming']
	});
});

it('counts live memories per scope, so an empty memory list is known without listing it', async () => {
	const memories = new InMemoryMemoryEntryRepository(testActor());
	memories.entries = [
		memoryEntryBuilder({ id: testMemoryEntryId(1), projectId: undefined }),
		memoryEntryBuilder({ id: testMemoryEntryId(2), projectId: undefined }),
		memoryEntryBuilder({
			id: testMemoryEntryId(3),
			projectId: undefined,
			deletedAt: testNow
		})
	];
	const shell = await (await provisionedWorkspace(memories)).getShellContext();
	expect({ user: shell.memory.user, projects: [...shell.memory.projects.values()] }).toEqual({
		user: 2,
		projects: [0]
	});
});
