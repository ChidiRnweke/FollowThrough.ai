import { expect, it } from 'vitest';
import { builtInSkillsFixture } from '$lib/testing/skills/fixtures/built-ins';
import { Workspace, type WorkspaceDependencies } from './controller';
import type { LocalDate } from '$lib/models/workspace';
import { InMemorySuggestionReader } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryTodos } from '$lib/testing/todos/fakes/in-memory-todos';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	memorySuggestionBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

it('counts pending proposals after expiry when assembling Today', async () => {
	const proposals = new InMemorySuggestionReader();
	proposals.suggestions = [memorySuggestionBuilder({ expiresAt: testNow })];
	const tasks = new InMemoryTodos();
	const controller = new Workspace(
		capabilityDependencies<WorkspaceDependencies>({
			suggestionExpirer: proposals,
			suggestionLister: proposals,
			noteTreeReader: new InMemoryNoteContent(),
			todoLister: tasks,
			waitingOnFinder: tasks,
			todoViewAssembler: tasks
		})
	);
	expect(
		(await controller.getTodayView(testActor(), { today: '2026-07-11' as LocalDate }))
			.pendingSuggestionCount
	).toBe(0);
});

it('reports expiry failure before returning shell attention', async () => {
	const proposals = new InMemorySuggestionReader();
	proposals.expiryFailure = new Error('Expiry storage is unavailable');
	const controller = new Workspace(
		capabilityDependencies<WorkspaceDependencies>({
			...builtInSkillsFixture(),
			suggestionExpirer: proposals
		})
	);
	await expect(controller.getShellContext(testActor())).rejects.toThrow(
		'Expiry storage is unavailable'
	);
});
