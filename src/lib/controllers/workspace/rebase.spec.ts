import { describe, expect, it } from 'vitest';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { projectBuilder, todoBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { rebaseWorkspaceRecord } from './rebase';

const todo = todoBuilder();
const record = (value: Partial<typeof todo>): WorkspaceRecord => ({
	type: 'todos',
	value: { ...todo, ...value, status: 'open', completedAt: undefined }
});

describe('workspace record replay', () => {
	it('never combines two resource types', () => {
		expect(
			rebaseWorkspaceRecord(record({}), record({}), { type: 'projects', value: projectBuilder() })
		).toBeNull();
	});
	it('completes a todo renamed elsewhere without a collision', () => {
		const done: WorkspaceRecord = {
			type: 'todos',
			value: { ...todo, status: 'done', completedAt: todo.updatedAt }
		};
		expect(
			rebaseWorkspaceRecord(
				record({}),
				done,
				record({ title: 'Renamed', updatedAt: todo.createdAt })
			)
		).toEqual({
			value: { type: 'todos', value: { ...done.value, title: 'Renamed' } },
			overlaps: false
		});
	});
});
