import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '$lib/server/db';
import type { ActorContext } from '$lib/models/identity';
import type { SyncEtag, SyncObjectRead } from '$lib/models/sync';
import type { WorkspaceResourceIdentity, WorkspaceResourceType } from '$lib/models/workspace-sync';
import {
	resourceDataSchemas,
	workspaceObjectReadSchema,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
import { syncIdentitySql, syncRegistrations } from './sync-catalog';

export interface SyncObjectRepository {
	read(
		actor: ActorContext,
		identity: WorkspaceResourceIdentity,
		etag: SyncEtag | null
	): Promise<SyncObjectRead<WorkspaceRecord>>;
}

/** Only named public fields are selected. Run state, auth data, and credentials cannot leak. */
const fields: Record<WorkspaceResourceType, readonly string[]> = {
	users: Object.keys(resourceDataSchemas.users.shape),
	projects: Object.keys(resourceDataSchemas.projects.shape),
	notes: Object.keys(resourceDataSchemas.notes.shape),
	todos: Object.keys(resourceDataSchemas.todos.shape),
	diagrams: Object.keys(resourceDataSchemas.diagrams.options[1].shape),
	source_anchors: Object.keys(resourceDataSchemas.source_anchors.shape),
	provenance: [
		'id',
		'userId',
		'producerKind',
		'producerName',
		'pipeline',
		'sourceAnchorId',
		'runId',
		'model',
		'metadata',
		'createdAt'
	],
	note_relationships: Object.keys(resourceDataSchemas.note_relationships.shape),
	references: Object.keys(resourceDataSchemas.references.shape),
	skills: Object.keys(resourceDataSchemas.skills.shape),
	project_skill_pins: Object.keys(resourceDataSchemas.project_skill_pins.shape),
	attachments: Object.keys(resourceDataSchemas.attachments.shape),
	attachment_versions: Object.keys(resourceDataSchemas.attachment_versions.shape),
	todo_attachments: Object.keys(resourceDataSchemas.todo_attachments.shape),
	skill_usages: Object.keys(resourceDataSchemas.skill_usages.shape),
	suggestions: Object.keys(resourceDataSchemas.suggestions.options[0].shape),
	conversations: Object.keys(resourceDataSchemas.conversations.shape),
	messages: Object.keys(resourceDataSchemas.messages.shape),
	agent_runs: Object.keys(resourceDataSchemas.agent_runs.shape),
	agent_preferences: Object.keys(resourceDataSchemas.agent_preferences.shape),
	user_preferences: Object.keys(resourceDataSchemas.user_preferences.shape),
	tool_preferences: Object.keys(resourceDataSchemas.tool_preferences.shape),
	project_tool_overrides: Object.keys(resourceDataSchemas.project_tool_overrides.shape),
	trust_policies: Object.keys(resourceDataSchemas.trust_policies.shape),
	memory_entries: Object.keys(resourceDataSchemas.memory_entries.shape),
	project_templates: Object.keys(resourceDataSchemas.project_templates.shape),
	export_settings: Object.keys(resourceDataSchemas.export_settings.shape),
	artifacts: Object.keys(resourceDataSchemas.artifacts.shape)
};

const columnValue = (field: string): SQL => {
	const name =
		field === 'from'
			? 'from_offset'
			: field === 'to'
				? 'to_offset'
				: field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
	const column = sql`r.${sql.identifier(name)}`;
	return field === 'eventCursor' ? sql`${column}::text` : column;
};

const publicRecordSql = (type: WorkspaceResourceType): SQL => sql`(
	select jsonb_object_agg(field, value) from jsonb_each(jsonb_build_object(
		${sql.join(
			fields[type].flatMap((field) => [sql`${field}::text`, columnValue(field)]),
			sql`, `
		)}
	)) as public_fields(field, value) where value <> 'null'::jsonb
)`;

export class WorkspaceSyncObjects implements SyncObjectRepository {
	constructor(private readonly db: Database) {}

	async read(
		actor: ActorContext,
		identity: WorkspaceResourceIdentity,
		etag: SyncEtag | null
	): Promise<SyncObjectRead<WorkspaceRecord>> {
		const registration = syncRegistrations.find((item) => item.type === identity.type);
		if (!registration) throw new Error(`No synchronization registration for ${identity.type}`);
		const tag = sql`('sync-v1-' || v.version::text)`;
		// Body and tag come from one statement snapshot. CASE avoids reading document bodies
		// for unchanged versions. Only top-level SQL nulls are omitted; nested JSON stays intact.
		const rows = await this.db.execute(sql`
			select case when ${tag} = ${etag} then jsonb_build_object('kind', 'unchanged', 'etag', ${tag})
			else jsonb_build_object('kind', 'found', 'snapshot', jsonb_build_object(
				'etag', ${tag}, 'value', jsonb_build_object('type', ${identity.type}::text,
				'value', ${publicRecordSql(identity.type)}))) end as result
			from ${sql.identifier(identity.type)} r
			left join workspace_sync_versions v on v.resource_type = ${identity.type}
				and v.resource_id = ${syncIdentitySql(registration)}
			where ${registration.scope(actor)} and ${syncIdentitySql(registration)} = ${JSON.stringify(identity.id)}::jsonb`);
		const resultRows = z.array(z.object({ result: workspaceObjectReadSchema }));
		const parsed = z
			.union([resultRows, z.object({ rows: resultRows })])
			.transform((result) => (Array.isArray(result) ? result : result.rows))
			.parse(rows);
		return parsed[0]?.result ?? { kind: 'unavailable' };
	}
}
