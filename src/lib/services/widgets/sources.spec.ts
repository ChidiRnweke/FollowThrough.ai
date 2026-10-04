import { describe, expect, it } from 'vitest';
import type { DateTime, LocalDate } from '$lib/models/workspace';
import type { NoteId } from '$lib/models/notes';
import type { TodoId } from '$lib/models/todos';
import { testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
import { widgetSourceRows, type WidgetSourceRecords } from './sources';

const projectId = testProjectId();
const elsewhere = testProjectId(2);
const at = '2026-10-01T09:00:00.000Z' as DateTime;
const todo = (id: string, fields: Partial<WidgetSourceRecords['todos'][number]> = {}) => ({
	id: id as TodoId,
	projectId,
	title: id,
	status: 'open' as const,
	responsibility: 'mine' as const,
	...fields
});
const note = (id: string, fields: Partial<WidgetSourceRecords['notes'][number]> = {}) => ({
	id: id as NoteId,
	projectId,
	title: id,
	kind: 'note' as const,
	isPinned: false,
	updatedAt: at,
	...fields
});
const records = (fields: Partial<WidgetSourceRecords>): WidgetSourceRecords => ({
	projectId,
	today: '2026-10-04' as LocalDate,
	todos: [],
	notes: [],
	...fields
});

describe('widget source rows', () => {
	it('marks an open todo due before today as overdue', () => {
		const rows = widgetSourceRows(
			{ todos: { kind: 'todos' } },
			records({ todos: [todo('Ship', { dueDate: '2026-10-03' as LocalDate })] })
		);
		expect(rows.todos?.[0]).toMatchObject({ open: true, overdue: true, statusLabel: 'Open' });
	});
	it('keeps only the live todos of the widget project, soonest due first', () => {
		const rows = widgetSourceRows(
			{ todos: { kind: 'todos' } },
			records({
				todos: [
					todo('Later', { dueDate: '2026-12-01' as LocalDate }),
					todo('Undated'),
					todo('Other project', { projectId: elsewhere }),
					todo('Deleted', { deletedAt: at }),
					todo('Sooner', { dueDate: '2026-10-10' as LocalDate })
				]
			})
		);
		expect(rows.todos).toMatchObject([
			{ title: 'Sooner' },
			{ title: 'Later' },
			{ title: 'Undated' }
		]);
	});
	it('lists notes, not folders or skills, most recently updated first', () => {
		const rows = widgetSourceRows(
			{ recent: { kind: 'notes' } },
			records({
				notes: [
					note('Old', { updatedAt: '2026-09-01T09:00:00.000Z' as DateTime }),
					note('Folder', { kind: 'folder' }),
					note('New', { updatedAt: '2026-10-02T09:00:00.000Z' as DateTime })
				]
			})
		);
		expect(rows.recent).toEqual([
			{ id: 'New', title: 'New', pinned: false, updatedDate: '2026-10-02' },
			{ id: 'Old', title: 'Old', pinned: false, updatedDate: '2026-09-01' }
		]);
	});
});
