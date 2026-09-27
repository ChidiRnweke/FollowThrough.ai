import { expect, it } from 'vitest';
import { WorkspaceViews } from './views';
import {
	noteRecordSchema,
	projectRecordSchema,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import {
	noteBuilder,
	projectBuilder,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

const note = noteRecordSchema.parse(noteBuilder());
const project = projectRecordSchema.parse(projectBuilder());
const records = (archived: boolean) =>
	new Map<string, WorkspaceRecord>([
		[JSON.stringify(['notes', note.id]), { type: 'notes', value: note }],
		[
			JSON.stringify(['projects', project.id]),
			{ type: 'projects', value: archived ? { ...project, archivedAt: testNow } : project }
		]
	]);
it('does not open a cached note in an archived project', () => {
	expect(new WorkspaceViews(records(true)).note(note.id)).toBeNull();
});
it('preserves the stored child lifecycle when its project is archived', () => {
	const views = new WorkspaceViews(records(true));
	expect(views.get('notes', note.id)).toEqual(note);
});
it('opens the same cached note when its project is active again', () => {
	expect(new WorkspaceViews(records(false)).note(note.id)?.view.note).toEqual(note);
});
