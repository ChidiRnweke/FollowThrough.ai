import { describe, expect, it } from 'vitest';
import type { ProjectId, TodoView } from '$lib/models';
import { testProjectId, testTodoId, todoBuilder } from '$lib/testing/fixtures/domain-builders';
import { sortTodoViews } from './todo-sort';

let nextId = 0;
const view = (overrides: Parameters<typeof todoBuilder>[0], sourceTitle?: string): TodoView => ({
	todo: todoBuilder({ id: testTodoId(++nextId), ...overrides }),
	...(sourceTitle !== undefined
		? { sourceNote: { id: testTodoId(900 + nextId) as never, title: sourceTitle } }
		: {})
});
const titles = (views: readonly TodoView[]): string[] => views.map((item) => item.todo.title);

describe('Todo table sorting', () => {
	it('a null key keeps the incoming order', () => {
		const views = [view({ title: 'B' }), view({ title: 'A' })];
		expect(titles(sortTodoViews(views, null, 'asc'))).toEqual(['B', 'A']);
	});

	it('status ascending follows the workflow order', () => {
		const views = [
			view({ title: 'done', status: 'done' }),
			view({ title: 'backlog', status: 'backlog' }),
			view({ title: 'cancelled', status: 'cancelled' }),
			view({ title: 'in progress', status: 'in_progress' }),
			view({ title: 'open', status: 'open' })
		];
		expect(titles(sortTodoViews(views, 'status', 'asc'))).toEqual([
			'backlog',
			'open',
			'in progress',
			'done',
			'cancelled'
		]);
	});

	it('priority ascending is urgency-first', () => {
		const views = [
			view({ title: 'low', priority: 'low' }),
			view({ title: 'high', priority: 'high' }),
			view({ title: 'medium', priority: 'medium' })
		];
		expect(titles(sortTodoViews(views, 'priority', 'asc'))).toEqual(['high', 'medium', 'low']);
	});

	it('todos without a priority sort last', () => {
		const views = [view({ title: 'none' }), view({ title: 'low', priority: 'low' })];
		expect(titles(sortTodoViews(views, 'priority', 'asc'))).toEqual(['low', 'none']);
	});

	it('due date ascending is chronological', () => {
		const views = [
			view({ title: 'later', dueDate: '2026-08-10' as never }),
			view({ title: 'sooner', dueDate: '2026-08-02' as never })
		];
		expect(titles(sortTodoViews(views, 'due', 'asc'))).toEqual(['sooner', 'later']);
	});

	it('undated todos sort last ascending', () => {
		const views = [view({ title: 'none' }), view({ title: 'dated', dueDate: '2026-08-02' as never })];
		expect(titles(sortTodoViews(views, 'due', 'asc'))).toEqual(['dated', 'none']);
	});

	it('undated todos sort last descending too', () => {
		const views = [view({ title: 'none' }), view({ title: 'dated', dueDate: '2026-08-02' as never })];
		expect(titles(sortTodoViews(views, 'due', 'desc'))).toEqual(['dated', 'none']);
	});

	it('descending reverses the comparator', () => {
		const views = [
			view({ title: 'low', priority: 'low' }),
			view({ title: 'high', priority: 'high' })
		];
		expect(titles(sortTodoViews(views, 'priority', 'desc'))).toEqual(['low', 'high']);
	});

	it('title sorts case-insensitively', () => {
		const views = [view({ title: 'banana' }), view({ title: 'Apple' })];
		expect(titles(sortTodoViews(views, 'title', 'asc'))).toEqual(['Apple', 'banana']);
	});

	it('category sorts alphabetically with uncategorised last', () => {
		const views = [
			view({ title: 'none' }),
			view({ title: 'release', category: 'Release 2.0' }),
			view({ title: 'client', category: 'Client work' })
		];
		expect(titles(sortTodoViews(views, 'category', 'asc'))).toEqual(['client', 'release', 'none']);
	});

	it('project sorts by resolved name with unknown projects last', () => {
		const known = testProjectId(7);
		const projectNames = new Map<ProjectId, string>([[known, 'Acme']]);
		const views = [
			view({ title: 'unknown' }),
			view({ title: 'known', projectId: known })
		];
		expect(titles(sortTodoViews(views, 'project', 'asc', projectNames))).toEqual([
			'known',
			'unknown'
		]);
	});

	it('source sorts by the source note title', () => {
		const views = [
			view({ title: 'no source' }),
			view({ title: 'sourced', }, 'Alpha note')
		];
		expect(titles(sortTodoViews(views, 'source', 'asc'))).toEqual(['sourced', 'no source']);
	});
});
