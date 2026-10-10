import { describe, expect, it } from 'vitest';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
const todoEditing = new TodoEditingRulesService();
import { todoBuilder, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

describe('local todo edits', () => {
	it('keeps unrelated fields when clearing a due date', () => {
		const todo = todoBuilder({ dueDate: '2026-09-10' as never, description: 'Keep context' });
		expect(todoEditing.edit(todo, { dueDate: null }, testNow)).toEqual({
			...todo,
			dueDate: undefined,
			waitingOn: undefined
		});
	});
	it('records completion when moving into done', () => {
		expect(todoEditing.edit(todoBuilder(), { status: 'done' }, testNow).completedAt).toBe(testNow);
	});
	it('clears completion when reopening a completed task', () => {
		expect(
			todoEditing.edit(
				todoBuilder({ status: 'done', completedAt: testNow }),
				{ status: 'open' },
				testNow
			).completedAt
		).toBeUndefined();
	});
	it('clears the counterparty when responsibility returns to me', () => {
		expect(
			todoEditing.edit(
				todoBuilder({ responsibility: 'waiting_on', waitingOn: 'Sam' }),
				{ responsibility: 'mine' },
				testNow
			).waitingOn
		).toBeUndefined();
	});
});
