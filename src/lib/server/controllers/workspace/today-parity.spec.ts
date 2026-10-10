import { createWorkspaceViews } from '$lib/factories/workspace/views';
import type { LocalDate } from '$lib/models/workspace';
import {
	noteRecordSchema,
	projectRecordSchema,
	resourceDataSchemas,
	todoRecordSchema,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import { MemoryPresentationService } from '$lib/services/memory/presentation';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { TodayPresentationService } from '$lib/services/workspace/today';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySuggestionReader } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemoryTodos } from '$lib/testing/todos/fakes/in-memory-todos';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	memorySuggestionBuilder,
	noteBuilder,
	projectBuilder,
	suggestionBuilder,
	testActor,
	testNoteId,
	testSuggestionId,
	testTodoId,
	todoBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { Workspace, type WorkspaceDependencies } from './controller';

describe('Today projection parity', () => {
	it('shows the same due groups, waiting work, notes and pending count from server and cached facts', async () => {
		const today = '2026-09-16' as LocalDate;
		const tasks = new InMemoryTodos();
		tasks.todos = [
			todoBuilder({ dueDate: '2026-09-15' as LocalDate }),
			todoBuilder({ id: testTodoId(2), dueDate: today }),
			todoBuilder({ id: testTodoId(3), dueDate: '2026-09-17' as LocalDate }),
			todoBuilder({ id: testTodoId(4), responsibility: 'waiting_on', waitingOn: 'Reviewer' })
		];
		const notes = new InMemoryNoteContent();
		notes.notes = [noteBuilder({ isPinned: true }), noteBuilder({ id: testNoteId(2) })];
		const suggestions = new InMemorySuggestionReader();
		suggestions.suggestions = [
			suggestionBuilder(),
			memorySuggestionBuilder({ id: testSuggestionId(2) }),
			memorySuggestionBuilder({ id: testSuggestionId(3), status: 'accepted' })
		];
		const records = [
			{ type: 'projects', value: projectRecordSchema.parse(projectBuilder()) },
			...tasks.todos.map((todo) => ({
				type: 'todos' as const,
				value: todoRecordSchema.parse(todo)
			})),
			...notes.notes.map((note) => ({
				type: 'notes' as const,
				value: noteRecordSchema.parse(note)
			})),
			...suggestions.suggestions.map((suggestion) => ({
				type: 'suggestions' as const,
				value: resourceDataSchemas.suggestions.parse(suggestion)
			}))
		] satisfies WorkspaceRecord[];
		const browser = createWorkspaceViews(
			new Map(records.map((record) => [JSON.stringify([record.type, record.value.id]), record]))
		);
		const server = new Workspace(
			new TodayPresentationService(),
			capabilityDependencies<WorkspaceDependencies>({
				...agentToolResultsFixture(),
				todoPresentation: new TodoPresentationService(),
				memoryPresentation: new MemoryPresentationService(),
				todoLister: tasks,
				waitingOnFinder: tasks,
				todoContextReader: tasks,
				noteTreeReader: notes,
				suggestionLister: suggestions,
				suggestionExpirer: suggestions
			})
		);
		expect(await server.getTodayView(testActor(), { today })).toEqual(browser.today(today));
	});
});
