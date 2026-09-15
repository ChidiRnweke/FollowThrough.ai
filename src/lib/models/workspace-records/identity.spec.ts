import { expect, it } from 'vitest';
import { workspaceRecordIdentity, workspaceRecordSchema } from './index';

const first = 'a0000000-0000-4000-8000-000000000001';
const second = 'a0000000-0000-4000-8000-000000000002';
const timestamps = { createdAt: '2026-09-08T00:00:00Z', updatedAt: '2026-09-08T00:00:00Z' };
it.each([
	{
		type: 'projects',
		value: { id: first, userId: second, name: 'Project', role: 'workspace', ...timestamps },
		id: [first]
	},
	{
		type: 'skills',
		value: {
			noteId: first,
			name: 'Skill',
			slug: 'skill',
			description: '',
			triggerHints: [],
			metadata: {},
			allowImplicitInvocation: false,
			isEnabled: true,
			...timestamps
		},
		id: [first]
	},
	{ type: 'user_preferences', value: { userId: first, ...timestamps }, id: [first] },
	{
		type: 'agent_preferences',
		value: {
			userId: first,
			executionMode: 'approval_required',
			inlineSuggestionsEnabled: true,
			...timestamps
		},
		id: [first]
	},
	{
		type: 'project_skill_pins',
		value: { projectId: first, skillNoteId: second, createdAt: timestamps.createdAt },
		id: [first, second]
	},
	{
		type: 'todo_attachments',
		value: { todoId: first, attachmentId: second, createdAt: timestamps.createdAt },
		id: [first, second]
	},
	{
		type: 'export_settings',
		value: { userId: first, projectId: second, settings: {}, ...timestamps },
		id: [first, second]
	},
	{
		type: 'tool_preferences',
		value: { userId: first, toolName: 'get_note', enabled: true, ...timestamps },
		id: [first, 'get_note']
	},
	{
		type: 'project_tool_overrides',
		value: {
			userId: first,
			projectId: second,
			toolName: 'get_note',
			enabled: false,
			...timestamps
		},
		id: [first, second, 'get_note']
	},
	{
		type: 'trust_policies',
		value: { userId: first, pipeline: 'agent', autoAcceptEnabled: false, ...timestamps },
		id: [first, 'agent']
	}
])('uses the registered key columns for $type', ({ type, value, id }) => {
	expect(workspaceRecordIdentity(workspaceRecordSchema.parse({ type, value }))).toEqual({
		type,
		id
	});
});
