import { describe, expect, it } from 'vitest';
import type { Todo, TodoView } from '$lib/models/todos';
import { filterTodosByTitle } from './todo-filter';

const view = (title: string): TodoView => ({
	todo: {
		id: '00000000-0000-4000-8000-000000000001' as Todo['id'],
		userId: '10000000-0000-4000-8000-000000000001' as Todo['userId'],
		projectId: '20000000-0000-4000-8000-000000000001' as Todo['projectId'],
		title,
		status: 'open',
		responsibility: 'mine',
		createdAt: '2026-07-12T08:00:00.000Z' as Todo['createdAt'],
		updatedAt: '2026-07-12T08:00:00.000Z' as Todo['updatedAt']
	}
});

describe('filterTodosByTitle', () => {
	it('keeps every todo when the query is empty', () => {
		expect(filterTodosByTitle([view('Ship'), view('Reply')], '')).toHaveLength(2);
	});

	it('matches titles case-insensitively by substring', () => {
		const result = filterTodosByTitle(
			[view('Ship the manifest'), view('Reply to review')],
			'MANIFEST'
		);
		expect(result.map((item) => item.todo.title)).toEqual(['Ship the manifest']);
	});

	it('drops every todo when nothing matches', () => {
		expect(filterTodosByTitle([view('Ship'), view('Reply')], 'nonexistent')).toHaveLength(0);
	});

	it('returns the original array for an empty query', () => {
		const todos = [view('Ship')];
		expect(filterTodosByTitle(todos, '  ')).toBe(todos);
	});
});
