import { describe, expect, it } from 'vitest';
import {
	noteRecordSchema,
	projectRecordSchema,
	todoRecordSchema,
	resourceDataSchemas,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import {
	noteBuilder,
	projectBuilder,
	todoBuilder,
	anchorBuilder,
	testNoteId,
	testProjectId,
	testTodoId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { WorkspaceViews } from './index';

const row = (record: WorkspaceRecord & { value: { id: string } }): [string, WorkspaceRecord] => [
	JSON.stringify([record.type, record.value.id]),
	record
];
const project = row({ type: 'projects', value: projectRecordSchema.parse(projectBuilder()) });

describe('normalized workspace lists', () => {
	it('hides notes and tasks when their project is archived', () => {
		const views = new WorkspaceViews(
			new Map([
				row({
					type: 'projects',
					value: projectRecordSchema.parse(projectBuilder({ archivedAt: testNow }))
				}),
				row({ type: 'notes', value: noteRecordSchema.parse(noteBuilder()) }),
				row({ type: 'todos', value: todoRecordSchema.parse(todoBuilder()) })
			])
		);
		expect({ notes: views.notes, todos: views.todos() }).toEqual({ notes: [], todos: [] });
	});
	it('preserves an extracted task’s origin when it is linked to a different note', () => {
		const anchor = anchorBuilder();
		const todo = todoBuilder({ sourceAnchorId: anchor.id, linkedNoteId: testNoteId(2) });
		const views = new WorkspaceViews(
			new Map([
				project,
				row({ type: 'notes', value: noteRecordSchema.parse(noteBuilder({ title: 'Origin' })) }),
				row({
					type: 'notes',
					value: noteRecordSchema.parse(noteBuilder({ id: testNoteId(2), title: 'Linked' }))
				}),
				row({ type: 'source_anchors', value: resourceDataSchemas.source_anchors.parse(anchor) }),
				row({ type: 'todos', value: todoRecordSchema.parse(todo) })
			])
		);
		expect(views.todos()[0]).toEqual({
			todo,
			anchor,
			sourceNote: { id: testNoteId(2), title: 'Linked' },
			originNote: { id: testNoteId(), title: 'Origin' }
		});
	});
	it('filters task categories and excludes deleted tasks', () => {
		const views = new WorkspaceViews(
			new Map([
				project,
				row({
					type: 'todos',
					value: todoRecordSchema.parse(todoBuilder({ category: 'Planning' }))
				}),
				row({
					type: 'todos',
					value: todoRecordSchema.parse(
						todoBuilder({ id: testTodoId(2), category: 'Removed', deletedAt: testNow })
					)
				})
			])
		);
		expect({
			categories: views.categories,
			filtered: views.todos({ category: 'Planning' }).map((view) => view.todo.id)
		}).toEqual({ categories: ['Planning'], filtered: [testTodoId()] });
	});
	it('builds project trees from the same current note records used by lists', () => {
		const views = new WorkspaceViews(
			new Map([
				project,
				row({
					type: 'notes',
					value: noteRecordSchema.parse(noteBuilder({ kind: 'folder', title: 'Folder' }))
				}),
				row({
					type: 'notes',
					value: noteRecordSchema.parse(
						noteBuilder({ id: testNoteId(2), parentId: testNoteId(), title: 'Child' })
					)
				}),
				row({
					type: 'notes',
					value: noteRecordSchema.parse(
						noteBuilder({ id: testNoteId(3), kind: 'skill', title: 'Skill' })
					)
				})
			])
		);
		expect(
			views.project(testProjectId())?.tree.map((node) => ({
				title: node.entry.title,
				children: node.children.map((child) => child.entry.title)
			}))
		).toEqual([{ title: 'Folder', children: ['Child'] }]);
	});
	it('reports an unavailable shell when this device has no user record', () => {
		expect(new WorkspaceViews(new Map()).shell('absent')).toBeNull();
	});
});
