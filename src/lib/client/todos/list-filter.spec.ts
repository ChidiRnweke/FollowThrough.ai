import { describe, expect, it } from 'vitest';
import { testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
import { readTodoListFilter } from './list-filter';
describe('task list URL boundary', () => {
	it('retains the supported shared filters', () => {
		expect(
			readTodoListFilter(
				new URLSearchParams({
					status: 'in_progress',
					responsibility: 'mine',
					projectId: testProjectId(),
					category: 'Follow up'
				})
			)
		).toEqual({
			status: 'in_progress',
			responsibility: 'mine',
			projectId: testProjectId(),
			category: 'Follow up'
		});
	});
	it('rejects an invalid status instead of pretending the list is empty', () => {
		expect(() => readTodoListFilter(new URLSearchParams({ status: 'invalid' }))).toThrow();
	});
	it('treats an empty URL selection as no filter', () => {
		expect(readTodoListFilter(new URLSearchParams({ category: '', projectId: '' }))).toEqual({});
	});
});
