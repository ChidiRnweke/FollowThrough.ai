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
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const note = noteRecordSchema.parse(noteBuilder({ kind: 'skill' }));
	const project = projectRecordSchema.parse(projectBuilder());
	const skill = resourceDataSchemas.skills.parse({
		noteId: note.id,
		name: 'Review',
		slug: 'review',
		description: 'Review a note',
		triggerHints: [],
		metadata: {},
		allowImplicitInvocation: true,
		isEnabled: true,
		createdAt: testNow,
		updatedAt: testNow
	});
	const records = new Map<string, WorkspaceRecord>([
		[JSON.stringify(['notes', note.id]), { type: 'notes', value: note }],
		[JSON.stringify(['projects', project.id]), { type: 'projects', value: project }],
		[JSON.stringify(['skills', note.id]), { type: 'skills', value: skill }]
	]);
	return { note, project, skill, records };
};
it('hides a cached skill after its project is archived', () => {
	const { records, project, note } = setup();
	records.set(JSON.stringify(['projects', project.id]), {
		type: 'projects',
		value: { ...project, archivedAt: testNow }
	});
	expect(createWorkspaceViews(records).skill(note.id)).toBeNull();
});
it('hides an individually archived skill from its editing detail', () => {
	const { records, note } = setup();
	records.set(JSON.stringify(['notes', note.id]), {
		type: 'notes',
		value: { ...note, archivedAt: testNow }
	});
	expect(createWorkspaceViews(records).skill(note.id)).toBeNull();
});
it('does not expose cached instructions before their project is available', () => {
	const { records, project, note } = setup();
	records.delete(JSON.stringify(['projects', project.id]));
	expect(createWorkspaceViews(records).skill(note.id)).toBeNull();
});
it('keeps a disabled skill available for deliberate editing in an active project', () => {
	const { records, skill, note } = setup();
	records.set(JSON.stringify(['skills', note.id]), {
		type: 'skills',
		value: { ...skill, isEnabled: false }
	});
	expect(createWorkspaceViews(records).skill(note.id)).toMatchObject({
		isEnabled: false,
		note: { id: note.id }
	});
});
