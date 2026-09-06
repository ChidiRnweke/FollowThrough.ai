import { sql, type SQL } from 'drizzle-orm';
import type { ActorContext } from '$lib/models/identity';
import type { WorkspaceResourceType } from '$lib/models/workspace-sync';

interface SyncRegistration {
	readonly type: WorkspaceResourceType;
	readonly keys: readonly string[];
	readonly scope: (actor: ActorContext) => SQL;
}

const owned = (actor: ActorContext): SQL => sql`r.user_id = ${actor.userId}`;
const noteOwned =
	(column: string) =>
	(actor: ActorContext): SQL => sql`exists (
	select 1 from notes n where n.id = r.${sql.identifier(column)} and n.user_id = ${actor.userId})`;
const projectOwned = (actor: ActorContext): SQL => sql`exists (
	select 1 from projects p where p.id = r.project_id and p.user_id = ${actor.userId})`;

/** This catalog governs authorized inventory membership, not active-list visibility. */
export const syncRegistrations: readonly SyncRegistration[] = [
	{ type: 'users', keys: ['id'], scope: (actor) => sql`r.id = ${actor.userId}` },
	...(
		[
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
	).map((type) => ({ type, keys: ['id'], scope: owned })),
	{ type: 'source_anchors', keys: ['id'], scope: noteOwned('note_id') },
	{ type: 'skills', keys: ['note_id'], scope: noteOwned('note_id') },
	{ type: 'skill_usages', keys: ['id'], scope: noteOwned('skill_note_id') },
	{
		type: 'project_skill_pins',
		keys: ['project_id', 'skill_note_id'],
		scope: (actor) => sql`
		${projectOwned(actor)} and ${noteOwned('skill_note_id')(actor)}`
	},
	{
		type: 'attachment_versions',
		keys: ['id'],
		scope: (actor) => sql`exists (
		select 1 from attachments a where a.id = r.attachment_id and a.user_id = ${actor.userId})`
	},
	{
		type: 'todo_attachments',
		keys: ['todo_id', 'attachment_id'],
		scope: (actor) => sql`exists (
		select 1 from todos t join attachments a on a.id = r.attachment_id
		where t.id = r.todo_id and t.user_id = ${actor.userId} and a.user_id = ${actor.userId})`
	},
	{
		type: 'messages',
		keys: ['id'],
		scope: (actor) => sql`exists (
		select 1 from conversations c where c.id = r.conversation_id and c.user_id = ${actor.userId})`
	},
	...(['agent_preferences', 'user_preferences'] as const).map((type) => ({
		type,
		keys: ['user_id'],
		scope: owned
	})),
	{ type: 'tool_preferences', keys: ['user_id', 'tool_name'], scope: owned },
	{
		type: 'project_tool_overrides',
		keys: ['user_id', 'project_id', 'tool_name'],
		scope: (actor) => sql`${owned(actor)} and ${projectOwned(actor)}`
	},
	{ type: 'trust_policies', keys: ['user_id', 'pipeline'], scope: owned },
	{
		type: 'export_settings',
		keys: ['user_id', 'project_id'],
		scope: (actor) => sql`${owned(actor)} and ${projectOwned(actor)}`
	}
];

export const syncIdentitySql = (registration: SyncRegistration): SQL => sql`jsonb_build_array(
	${sql.join(
		registration.keys.map((key) => sql`r.${sql.identifier(key)}::text`),
		sql`, `
	)})`;
