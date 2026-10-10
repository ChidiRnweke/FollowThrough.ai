import { rebaseWorkspaceRecord } from '$lib/factories/workspace/rebase';
import { widgetTemplates } from '$lib/models/widgets';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';
import { projectBuilder, todoBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';

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
	it('merges widget ticks of different items made on two devices', () => {
		const items = widgetTemplates.checklist.data.items;
		const data = (done: readonly boolean[]) => ({
			...widgetTemplates.checklist.data,
			items: items.map((item, index) => ({ ...item, done: done[index] ?? false }))
		});
		const widget = (done: readonly boolean[], title = 'Checklist'): WorkspaceRecord => ({
			type: 'widgets',
			value: widgetBuilder({ title, data: data(done) })
		});
		const merged = rebaseWorkspaceRecord(
			widget([]),
			widget([true]),
			widget([false, true], 'Renamed')
		);
		expect(
			merged?.value.type === 'widgets' && [
				merged.value.value.title,
				merged.value.value.data,
				merged.value.value.dataRevision,
				merged.overlaps
			]
		).toEqual(['Renamed', data([true, true]), 2, false]);
	});
});
