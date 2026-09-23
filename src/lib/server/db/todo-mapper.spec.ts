import { expect, it } from 'vitest';
import { toTodo } from './mappers';

const instant = new Date('2026-09-23T10:00:00.000Z');
const row = (status: 'done' | 'open', completedAt: Date | null): Parameters<typeof toTodo>[0] => ({
	id: '10000000-0000-4000-8000-000000000001',
	userId: '20000000-0000-4000-8000-000000000002',
	projectId: '30000000-0000-4000-8000-000000000003',
	title: 'Send the draft',
	description: null,
	status,
	responsibility: 'mine',
	priority: null,
	category: null,
	waitingOn: null,
	dueDate: null,
	dueDateVerbatim: null,
	promiseStrength: null,
	sourceAnchorId: null,
	linkedNoteId: null,
	provenanceId: null,
	completedAt,
	deletedAt: null,
	createdAt: instant,
	updatedAt: instant
});

it('rejects a stored done task that has no completion timestamp', () => {
	expect(() => toTodo(row('done', null))).toThrow();
});

it('rejects a stored open task that still has a completion timestamp', () => {
	expect(() => toTodo(row('open', instant))).toThrow();
});

it('retains the recorded completion time of a valid done task', () => {
	const todo = toTodo(row('done', instant));
	expect({ status: todo.status, completedAt: todo.completedAt }).toEqual({
		status: 'done',
		completedAt: instant.toISOString()
	});
});

it('does not invent a completion timestamp for an open task', () => {
	expect(toTodo(row('open', null)).completedAt).toBeUndefined();
});
