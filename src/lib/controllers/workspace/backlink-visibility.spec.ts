import { expect, it } from 'vitest';
import { createWorkspaceViews } from '$lib/factories/workspace/views';
import {
	noteRecordSchema,
	projectRecordSchema,
	resourceDataSchemas,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import {
	noteBuilder,
	projectBuilder,
	testNoteId,
	testProjectId,
	testNow,
	testActor
} from '$lib/testing/workspace/fixtures/domain-builders';

const note = noteRecordSchema.parse(
	noteBuilder({ kind: 'skill', builtInKey: 'followthrough', title: 'Recovered built-in' })
);
const target = noteRecordSchema.parse(
	noteBuilder({ id: testNoteId(2), projectId: testProjectId(2), title: 'Archived project note' })
);
const edge = resourceDataSchemas.note_relationships.parse({
	id: 'a0000000-0000-4000-8000-000000000001',
	userId: testActor().userId,
	sourceNoteId: note.id,
	targetNoteId: target.id,
	kind: 'mentions',
	createdAt: testNow,
	updatedAt: testNow
});
const records = (archived: boolean) =>
	new Map<string, WorkspaceRecord>([
		[JSON.stringify(['notes', note.id]), { type: 'notes', value: note }],
		[JSON.stringify(['notes', target.id]), { type: 'notes', value: target }],
		[
			JSON.stringify(['projects', note.projectId]),
			{ type: 'projects', value: projectRecordSchema.parse(projectBuilder()) }
		],
		[
			JSON.stringify(['projects', target.projectId]),
			{
				type: 'projects',
				value: projectRecordSchema.parse(
					projectBuilder({ id: target.projectId, ...(archived ? { archivedAt: testNow } : {}) })
				)
			}
		],
		[JSON.stringify(['note_relationships', edge.id]), { type: 'note_relationships', value: edge }]
	]);
it('hides a retained backlink into an archived project after built-in relocation', () => {
	const views = createWorkspaceViews(records(true));
	expect({
		backlinks: views.note(note.id)?.view.backlinks,
		storedRelationship: views.get('note_relationships', edge.id)
	}).toEqual({ backlinks: [], storedRelationship: edge });
});
it('keeps the backlink when both projects are active', () => {
	expect(
		createWorkspaceViews(records(false))
			.note(note.id)
			?.view.backlinks.map((item) => item.targetNote.id)
	).toEqual([target.id]);
});
