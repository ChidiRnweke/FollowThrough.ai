import { describe, expect, it } from 'vitest';
import { applyTodoEdit } from './index';
import { todoBuilder, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

describe('local todo edits', () => {
	it('keeps unrelated fields when clearing a due date', () => {
		const todo = todoBuilder({ dueDate: '2026-09-10' as never, description: 'Keep context' });
		expect(applyTodoEdit(todo, { dueDate: null }, testNow)).toEqual({
			...todo,
			dueDate: undefined,
			waitingOn: undefined
		});
	});
	it('records completion when moving into done', () => {
		expect(applyTodoEdit(todoBuilder(), { status: 'done' }, testNow).completedAt).toBe(testNow);
	});
	it('clears completion when reopening a completed task', () => {
		expect(
			applyTodoEdit(
				todoBuilder({ status: 'done', completedAt: testNow }),
				{ status: 'open' },
				testNow
			).completedAt
		).toBeUndefined();
	});
	it('clears the counterparty when responsibility returns to me', () => {
		expect(
			applyTodoEdit(
				todoBuilder({ responsibility: 'waiting_on', waitingOn: 'Sam' }),
				{ responsibility: 'mine' },
				testNow
			).waitingOn
		).toBeUndefined();
	});
});
