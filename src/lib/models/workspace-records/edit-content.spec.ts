import { describe, expect, it } from 'vitest';
import { workspaceEditContentEquals } from './index';
import { todoBuilder, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

describe('acknowledged editor content', () => {
	it('recognizes a todo acknowledgement with server timestamps and reordered fields', () => {
		const todo = todoBuilder({ status: 'done', completedAt: testNow });
		const { title, ...rest } = todo;
		expect(
			workspaceEditContentEquals(
				{ type: 'todos', value: todo },
				{
					type: 'todos',
					value: { ...rest, completedAt: '2026-09-07T12:00:00.000Z' as never, title }
				}
			)
		).toBe(true);
	});
	it('does not rebase a rendered todo over another clients changed content', () => {
		const todo = todoBuilder();
		expect(
			workspaceEditContentEquals(
				{ type: 'todos', value: todo },
				{ type: 'todos', value: { ...todo, title: 'Another client' } }
			)
		).toBe(false);
	});
});
