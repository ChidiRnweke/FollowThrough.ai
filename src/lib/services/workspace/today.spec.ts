import { describe, expect, it } from 'vitest';
import type { DateTime, LocalDate } from '$lib/models/workspace';
import {
	noteBuilder,
	todoBuilder,
	testNoteId,
	testTodoId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { assembleToday } from './today';

const today = '2026-09-16' as LocalDate;
describe('Today grouping from resolved facts', () => {
	it('uses the supplied local date for overdue and due-today groups', () => {
		const overdue = todoBuilder({ id: testTodoId(1), dueDate: '2026-09-15' as LocalDate });
		const due = todoBuilder({ id: testTodoId(2), dueDate: today });
		const future = todoBuilder({ id: testTodoId(3), dueDate: '2026-09-17' as LocalDate });
		const undated = todoBuilder({ id: testTodoId(4), dueDate: undefined });
		const view = assembleToday({
			today,
			due: [overdue, due, future, undated].map((todo) => ({ todo })),
			waiting: [],
			notes: [],
			pendingSuggestionCount: 0
		});
		expect({
			overdue: view.overdue.map((item) => item.todo.id),
			today: view.dueToday.map((item) => item.todo.id)
		}).toEqual({ overdue: [overdue.id], today: [due.id] });
	});
	it('keeps waiting tasks independent of their due date', () => {
		const todo = todoBuilder({
			responsibility: 'waiting_on',
			waitingOn: 'Reviewer',
			dueDate: undefined
		});
		const view = assembleToday({
			today,
			due: [],
			waiting: [{ todo }],
			notes: [],
			pendingSuggestionCount: 7
		});
		expect({
			waiting: view.waitingOn.map((item) => item.todo.id),
			pending: view.pendingSuggestionCount
		}).toEqual({ waiting: [todo.id], pending: 7 });
	});
	it('keeps all pinned notes while presenting the five most recent notes', () => {
		const notes = Array.from({ length: 8 }, (_, index) =>
			noteBuilder({
				id: testNoteId(index + 1),
				isPinned: true,
				updatedAt: `2026-09-${String(index + 1).padStart(2, '0')}T12:00:00.000Z` as DateTime
			})
		);
		const view = assembleToday({ today, due: [], waiting: [], notes, pendingSuggestionCount: 0 });
		expect({
			pins: view.pinnedNotes.map((note) => note.id),
			recent: view.recentNotes.map((note) => note.id),
			input: notes.map((note) => note.id)
		}).toEqual({
			pins: notes.map((note) => note.id),
			recent: [8, 7, 6, 5, 4].map(testNoteId),
			input: [1, 2, 3, 4, 5, 6, 7, 8].map(testNoteId)
		});
	});
	it('does not invent records when the supplied view is partial', () => {
		expect(
			assembleToday({ today, due: [], waiting: [], notes: [], pendingSuggestionCount: 0 })
		).toEqual({
			overdue: [],
			dueToday: [],
			waitingOn: [],
			pendingSuggestionCount: 0,
			pinnedNotes: [],
			recentNotes: []
		});
	});
});
