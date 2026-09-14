import { sql, type SQL } from 'drizzle-orm';
import type { ActorContext } from '$lib/models/identity';
import type { WorkspaceResourceType } from '$lib/models/workspace-sync';

interface SyncRegistration {
	readonly type: WorkspaceResourceType;
	readonly keys: readonly string[];
}

/** This catalog governs authorized inventory membership, not active-list visibility. */
export const syncRegistrations: readonly SyncRegistration[] = [
	...(
		[
			'users',
			'source_anchors',
			'skill_usages',
			'attachment_versions',
			'messages',
			'projects',
			'notes',
			'provenance',
			'todos',
			'note_relationships',
			'references',
			'diagrams',
			'attachments',
			'suggestions',
			'conversations',
			'agent_runs',
			'memory_entries',
			'project_templates',
			'artifacts'
		] as const
	).map((type) => ({ type, keys: ['id'] })),
	{ type: 'skills', keys: ['note_id'] },
	{
		type: 'project_skill_pins',
		keys: ['project_id', 'skill_note_id']
	},
	{
		type: 'todo_attachments',
		keys: ['todo_id', 'attachment_id']
	},
	...(['agent_preferences', 'user_preferences'] as const).map((type) => ({
		type,
		keys: ['user_id']
	})),
	{ type: 'tool_preferences', keys: ['user_id', 'tool_name'] },
	{
		type: 'project_tool_overrides',
		keys: ['user_id', 'project_id', 'tool_name']
	},
	{ type: 'trust_policies', keys: ['user_id', 'pipeline'] },
	{
		type: 'export_settings',
		keys: ['user_id', 'project_id']
	}
];

export const syncIdentitySql = (registration: SyncRegistration): SQL => sql`jsonb_build_array(
	${sql.join(
		registration.keys.map((key) => sql`r.${sql.identifier(key)}::text`),
		sql`, `
	)})`;

/** Same ownership rule used by version triggers, selected reads and resource locks. */
export const syncOwnerSql = (type: WorkspaceResourceType, actor: ActorContext): SQL =>
	sql`workspace_sync_account(${type}, to_jsonb(r)) = ${actor.userId}`;
