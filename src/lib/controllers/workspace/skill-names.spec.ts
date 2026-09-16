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
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

it('shows an offline note rename before the skill metadata projection synchronizes', () => {
	const note = noteRecordSchema.parse(noteBuilder({ kind: 'skill', title: 'Ship checklist' }));
	const metadata = resourceDataSchemas.skills.parse({
		noteId: note.id,
		name: 'Release checklist',
		slug: 'release-checklist',
		description: 'Release instructions',
		triggerHints: [],
		metadata: {},
		allowImplicitInvocation: true,
		isEnabled: true,
		createdAt: testNow,
		updatedAt: testNow
	});
	const records: [string, WorkspaceRecord][] = [
		[JSON.stringify(['notes', note.id]), { type: 'notes', value: note }],
		[JSON.stringify(['skills', note.id]), { type: 'skills', value: metadata }],
		[
			JSON.stringify(['projects', note.projectId]),
			{ type: 'projects', value: projectRecordSchema.parse(projectBuilder()) }
		]
	];
	expect(new WorkspaceViews(new Map(records)).skills().map((skill) => skill.name)).toEqual([
		'Ship checklist'
	]);
});
