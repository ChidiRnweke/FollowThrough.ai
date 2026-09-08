import { describe, expect, it } from 'vitest';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import {
	memoryEntryBuilder,
	noteBuilder,
	projectBuilder,
	todoBuilder,
	testProjectId,
	testMemoryEntryId,
	testNoteId,
	testTodoId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { WorkspaceViews } from './index';

const views = (records: readonly WorkspaceRecord[]) =>
	new WorkspaceViews(
		new Map(
			records.map((record) => {
				if (!('id' in record.value)) throw new Error('This fixture uses single-ID resources');
				return [JSON.stringify([record.type, record.value.id]), record];
			})
		)
	);

describe('shared agent context counts', () => {
	it('counts only shared profile memory when no project is selected', () => {
		const data = views([
			{
				type: 'memory_entries',
				value: memoryEntryBuilder({ projectId: undefined, shareWithAgents: true })
			},
			{
				type: 'memory_entries',
				value: memoryEntryBuilder({
					id: testMemoryEntryId(2),
					projectId: undefined,
					shareWithAgents: false
				})
			},
			{
				type: 'memory_entries',
				value: memoryEntryBuilder({
					id: testMemoryEntryId(3),
					projectId: testProjectId(),
					shareWithAgents: true
				})
			},
			{ type: 'notes', value: noteBuilder() },
			{ type: 'todos', value: todoBuilder() }
		]);
		expect(data.capabilityCounts()).toEqual({ memory: 1, notes: 0, todos: 0, attachments: 0 });
	});
	it('counts active notes and open tasks only in the selected project', () => {
		const data = views([
			{ type: 'projects', value: projectBuilder() },
			{ type: 'projects', value: projectBuilder({ id: testProjectId(2) }) },
			{ type: 'notes', value: noteBuilder() },
			{ type: 'notes', value: noteBuilder({ id: testNoteId(2), projectId: testProjectId(2) }) },
			{ type: 'todos', value: todoBuilder({ status: 'open' }) },
			{ type: 'todos', value: todoBuilder({ id: testTodoId(2), status: 'done' }) },
			{
				type: 'todos',
				value: todoBuilder({ id: testTodoId(3), projectId: testProjectId(2), status: 'open' })
			}
		]);
		expect(data.capabilityCounts(testProjectId())).toEqual({
			memory: 0,
			notes: 1,
			todos: 1,
			attachments: 0
		});
	});
});
