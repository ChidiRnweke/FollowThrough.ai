import { expect, it } from 'vitest';
import { WorkspaceViews } from './views';
import {
	noteRecordSchema,
	projectRecordSchema,
	resourceDataSchemas,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import {
	noteBuilder,
	projectBuilder,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const home = projectRecordSchema.parse(projectBuilder({ role: 'inbox' }));
	const project = projectRecordSchema.parse(
		projectBuilder({ id: testProjectId(2), name: 'Launch' })
	);
	const note = noteRecordSchema.parse(
		noteBuilder({ kind: 'skill', title: 'Release checklist', isPinned: true })
	);
	const metadata = resourceDataSchemas.skills.parse({
		noteId: note.id,
		name: note.title,
		slug: 'release-checklist',
		description: 'Release instructions',
		triggerHints: [],
		metadata: {},
		allowImplicitInvocation: true,
		isEnabled: true,
		createdAt: testNow,
		updatedAt: testNow
	});
	const pin = { projectId: project.id, skillNoteId: note.id, createdAt: testNow };
	const records: [string, WorkspaceRecord][] = [
		[JSON.stringify(['projects', home.id]), { type: 'projects', value: home }],
		[JSON.stringify(['projects', project.id]), { type: 'projects', value: project }],
		[JSON.stringify(['notes', note.id]), { type: 'notes', value: note }],
		[JSON.stringify(['skills', note.id]), { type: 'skills', value: metadata }],
		[
			JSON.stringify(['project_skill_pins', project.id, note.id]),
			{ type: 'project_skill_pins', value: pin }
		]
	];
	return { views: new WorkspaceViews(new Map(records)), note, project, home };
};

it('does not turn a note pin into a project skill pin in the global catalog', () => {
	const { views } = setup();
	expect(views.skills().map((skill) => skill.isPinned)).toEqual([false]);
});

it('offers a skill stored in another project with its selected-project pin', () => {
	const { views, note, project } = setup();
	expect(
		views.skills(project.id).map((skill) => ({ id: skill.noteId, pinned: skill.isPinned }))
	).toEqual([{ id: note.id, pinned: true }]);
});

it('keeps a different project’s pin out of the selected project', () => {
	const { views, home } = setup();
	expect(views.skills(home.id).map((skill) => skill.isPinned)).toEqual([false]);
});
