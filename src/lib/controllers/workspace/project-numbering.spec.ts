import { expect, it } from 'vitest';
import { prepareWorkspaceCommand } from './commands';
import { createWorkspaceViews } from '$lib/factories/workspace/views';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

it.each([
	{ enabled: false, noteOverride: undefined, expected: false },
	{ enabled: true, noteOverride: undefined, expected: true },
	{ enabled: undefined, noteOverride: undefined, expected: true },
	{ enabled: true, noteOverride: false, expected: false }
])(
	'projects numbering choice $enabled into a note with override $noteOverride',
	({ enabled, noteOverride, expected }) => {
		const project = projectBuilder({ sectionNumberingDefault: false });
		const note = noteBuilder({ sectionNumbering: noteOverride });
		const result = prepareWorkspaceCommand(
			{ kind: 'projectNumbering', projectId: project.id, enabled },
			{ type: 'projects', value: project },
			{ userId: testActor().userId, now: testNow, records: new Map(), inventory: 'complete' }
		);
		if (!result.local) throw new Error('Numbering must retain the project');
		const records = new Map<string, WorkspaceRecord>([
			[JSON.stringify(['projects', project.id]), result.local],
			[JSON.stringify(['notes', note.id]), { type: 'notes', value: note }],
			[
				JSON.stringify(['user_preferences', project.userId]),
				{
					type: 'user_preferences',
					value: {
						userId: project.userId,
						sectionNumberingDefault: true,
						createdAt: testNow,
						updatedAt: testNow
					}
				}
			]
		]);
		expect(createWorkspaceViews(records).note(note.id)?.view.sectionNumbering.effective).toBe(
			expected
		);
	}
);
