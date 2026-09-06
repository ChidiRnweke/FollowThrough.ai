import { z } from 'zod';

export const workspaceResourceTypeSchema = z.enum([
	'users',
	'projects',
	'notes',
	'source_anchors',
	'provenance',
	'todos',
	'note_relationships',
	'references',
	'diagrams',
	'skills',
	'project_skill_pins',
	'attachments',
	'attachment_versions',
	'todo_attachments',
	'skill_usages',
	'suggestions',
	'conversations',
	'messages',
	'agent_runs',
	'agent_preferences',
	'user_preferences',
	'tool_preferences',
	'project_tool_overrides',
	'trust_policies',
	'memory_entries',
	'project_templates',
	'export_settings',
	'artifacts'
]);
export type WorkspaceResourceType = z.infer<typeof workspaceResourceTypeSchema>;

export const workspaceResourceIdentitySchema = z.discriminatedUnion('type', [
	z.object({
		type: z.enum([
			'users',
			'projects',
			'notes',
			'source_anchors',
			'provenance',
			'todos',
			'note_relationships',
			'references',
			'diagrams',
			'skills',
			'attachments',
			'attachment_versions',
			'skill_usages',
			'suggestions',
			'conversations',
			'messages',
			'agent_runs',
			'agent_preferences',
			'user_preferences',
			'memory_entries',
			'project_templates',
			'artifacts'
		]),
		id: z.tuple([z.string().uuid()])
	}),
	z.object({
		type: z.enum(['project_skill_pins', 'todo_attachments', 'export_settings']),
		id: z.tuple([z.string().uuid(), z.string().uuid()])
	}),
	z.object({
		type: z.literal('tool_preferences'),
		id: z.tuple([z.string().uuid(), z.string().min(1)])
	}),
	z.object({
		type: z.literal('project_tool_overrides'),
		id: z.tuple([z.string().uuid(), z.string().uuid(), z.string().min(1)])
	}),
	z.object({
		type: z.literal('trust_policies'),
		id: z.tuple([
			z.string().uuid(),
			z.enum(['extract_promises', 'relate', 'reference', 'memory', 'agent'])
		])
	})
]);
export type WorkspaceResourceIdentity = z.infer<typeof workspaceResourceIdentitySchema>;

/** Tuple encoding avoids delimiter collisions in composite identities such as tool names. */
export const workspaceResourceKey = (identity: WorkspaceResourceIdentity): string =>
	JSON.stringify([identity.type, ...identity.id]);
