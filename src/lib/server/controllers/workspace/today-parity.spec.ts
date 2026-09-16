import { describe, expect, it } from 'vitest';
import { Workspace, type WorkspaceDependencies } from './controller';
import { WorkspaceViews } from '$lib/controllers/workspace/views';
import type { LocalDate } from '$lib/models/workspace';
import {
	noteRecordSchema,
	projectRecordSchema,
	todoRecordSchema,
	resourceDataSchemas,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import { InMemoryTodos } from '$lib/testing/todos/fakes/in-memory-todos';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySuggestionReader } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	projectBuilder,
	todoBuilder,
	suggestionBuilder,
	memorySuggestionBuilder,
	testActor,
	testNoteId,
	testTodoId,
	testSuggestionId
} from '$lib/testing/workspace/fixtures/domain-builders';

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
		const browser = new WorkspaceViews(
			new Map(records.map((record) => [JSON.stringify([record.type, record.value.id]), record]))
		);
		const server = new Workspace(
			capabilityDependencies<WorkspaceDependencies>({
				todoLister: tasks,
				waitingOnFinder: tasks,
				todoViewAssembler: tasks,
				noteTreeReader: notes,
				suggestionLister: suggestions,
				suggestionExpirer: suggestions
			})
		);
		expect(await server.getTodayView(testActor(), { today })).toEqual(browser.today(today));
	});
});
