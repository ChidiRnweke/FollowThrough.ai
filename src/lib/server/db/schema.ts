import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	check,
	date,
	halfvec,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

export const noteKind = pgEnum('note_kind', ['folder', 'note', 'skill']);
export const todoStatus = pgEnum('todo_status', [
	'backlog',
	'open',
	'in_progress',
	'done',
	'cancelled'
]);
export const apiTokenScope = pgEnum('api_token_scope', ['read', 'full']);
export const todoResponsibility = pgEnum('todo_responsibility', ['mine', 'waiting_on']);
export const todoPriority = pgEnum('todo_priority', ['low', 'medium', 'high']);
export const memoryEntryType = pgEnum('memory_entry_type', [
	'fact',
	'decision',
	'constraint',
	'preference'
]);
export const promiseStrength = pgEnum('promise_strength', ['explicit', 'implied', 'tentative']);
export const diagramKind = pgEnum('diagram_kind', ['mermaid', 'drawio']);
export const relationshipKind = pgEnum('relationship_kind', [
	'prior_decision',
	'contradicts',
	'elaborates',
	'mentions'
]);
export const suggestionKind = pgEnum('suggestion_kind', [
	'todo',
	'backlink',
	'reference',
	'diagram',
	'memory'
]);
export const suggestionStatus = pgEnum('suggestion_status', [
	'proposed',
	'accepted',
	'rejected',
	'expired',
	'reverted'
]);
export const producerKind = pgEnum('producer_kind', ['user', 'pipeline', 'agent']);
export const pipelineKind = pgEnum('pipeline_kind', [
	'extract_promises',
	'relate',
	'reference',
	'agent',
	'memory'
]);
export const referenceTier = pgEnum('reference_tier', [
	'official',
	'standard',
	'vendor',
	'community'
]);
export const messageRole = pgEnum('message_role', ['user', 'assistant', 'tool']);
export const agentExecutionMode = pgEnum('agent_execution_mode', [
	'approval_required',
	'auto_accept'
]);
export const agentRunStatus = pgEnum('agent_run_status', [
	'queued',
	'running',
	'awaiting_approval',
	'cancelling',
	'completed',
	'failed',
	'cancelled'
]);
export const agentRunDecision = pgEnum('agent_run_decision', ['approve', 'reject']);
export const conversationKind = pgEnum('conversation_kind', ['chat', 'workflow']);
export const userRole = pgEnum('user_role', ['USER', 'ADMIN', 'WAITING']);

type ProseMirrorDocument = Record<string, unknown>;
type JsonObject = Record<string, unknown>;

const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
};

export const users = pgTable(
	'users',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		email: text('email').notNull(),
		displayName: text('display_name').notNull(),
		avatarUrl: text('avatar_url'),
		role: userRole('role').notNull().default('WAITING'),
		authProvider: text('auth_provider'),
		authProviderId: text('auth_provider_id'),
		...timestamps
	},
	(table) => [
		uniqueIndex('users_email_unique').on(sql`lower(${table.email})`),
		uniqueIndex('users_auth_provider_id_unique').on(table.authProviderId)
	]
);

export const sessions = pgTable('sessions', {
	id: text('id').primaryKey(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * Bearer credentials for the MCP endpoint. Only the sha256 of the token is
 * stored; the plaintext is shown to the user once at mint time. `scope`
 * decides which tool classifications the token can reach.
 */
export const apiTokens = pgTable(
	'api_tokens',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		tokenHash: text('token_hash').notNull(),
		scope: apiTokenScope('scope').notNull().default('read'),
		lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('api_tokens_token_hash_unique').on(table.tokenHash),
		index('api_tokens_user_created_idx').on(table.userId, table.createdAt)
	]
);

export const projects = pgTable(
	'projects',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description'),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		...timestamps
	},
	(table) => [
		uniqueIndex('projects_user_name_unique')
			.on(table.userId, sql`lower(${table.name})`)
			.where(sql`${table.archivedAt} is null`),
		index('projects_user_updated_idx').on(table.userId, table.updatedAt)
	]
);

export const notes = pgTable(
	'notes',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		parentId: uuid('parent_id').references((): AnyPgColumn => notes.id, { onDelete: 'set null' }),
		kind: noteKind('kind').notNull().default('note'),
		position: integer('position').notNull().default(0),
		title: text('title').notNull(),
		builtInKey: text('built_in_key'),
		document: jsonb('document')
			.$type<ProseMirrorDocument>()
			.notNull()
			.default({ type: 'doc', content: [] }),
		plainText: text('plain_text').notNull().default(''),
		currentRevision: integer('current_revision').notNull().default(1),
		publishedRevision: integer('published_revision').notNull().default(0),
		isPinned: boolean('is_pinned').notNull().default(false),
		publishedAt: timestamp('published_at', { withTimezone: true }),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		...timestamps
	},
	(table) => [
		index('notes_user_updated_idx').on(table.userId, table.updatedAt),
		index('notes_project_parent_position_idx').on(table.projectId, table.parentId, table.position),
		index('notes_parent_idx').on(table.parentId),
		index('notes_user_kind_idx').on(table.userId, table.kind),
		uniqueIndex('notes_user_built_in_key_unique')
			.on(table.userId, table.builtInKey)
			.where(sql`${table.builtInKey} is not null`)
	]
);

// Stable editor positions. nodeId is emitted by Tiptap's UniqueID extension; quotes
// allow an anchor to be repaired if surrounding document structure changes.
export const sourceAnchors = pgTable(
	'source_anchors',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		noteId: uuid('note_id')
			.notNull()
			.references(() => notes.id, { onDelete: 'cascade' }),
		nodeId: text('node_id'),
		fromOffset: integer('from_offset'),
		toOffset: integer('to_offset'),
		quote: text('quote').notNull(),
		prefix: text('prefix'),
		suffix: text('suffix'),
		revision: integer('revision').notNull().default(1),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('source_anchors_note_idx').on(table.noteId),
		check(
			'source_anchors_offsets_valid',
			sql`${table.fromOffset} is null or ${table.toOffset} is null or ${table.fromOffset} <= ${table.toOffset}`
		)
	]
);

export const provenance = pgTable(
	'provenance',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		producerKind: producerKind('producer_kind').notNull(),
		producerName: text('producer_name').notNull(),
		pipeline: pipelineKind('pipeline'),
		sourceAnchorId: uuid('source_anchor_id').references(() => sourceAnchors.id, {
			onDelete: 'set null'
		}),
		runId: text('run_id'),
		model: text('model'),
		metadata: jsonb('metadata').$type<JsonObject>().notNull().default({}),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('provenance_user_created_idx').on(table.userId, table.createdAt)]
);

// Immutable snapshots. The service creates one only at meaningful save boundaries
// (explicit save, accepted AI edit, or autosave debounce), not on every keystroke.
export const noteRevisions = pgTable(
	'note_revisions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		noteId: uuid('note_id')
			.notNull()
			.references(() => notes.id, { onDelete: 'cascade' }),
		revision: integer('revision').notNull(),
		title: text('title').notNull(),
		document: jsonb('document').$type<ProseMirrorDocument>().notNull(),
		plainText: text('plain_text').notNull(),
		provenanceId: uuid('provenance_id').references(() => provenance.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('note_revisions_note_revision_unique').on(table.noteId, table.revision),
		index('note_revisions_note_created_idx').on(table.noteId, table.createdAt),
		check('note_revisions_revision_positive', sql`${table.revision} > 0`)
	]
);

export const todos = pgTable(
	'todos',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		description: text('description'),
		status: todoStatus('status').notNull().default('open'),
		responsibility: todoResponsibility('responsibility').notNull().default('mine'),
		priority: todoPriority('priority'),
		category: text('category'),
		waitingOn: text('waiting_on'),
		dueDate: date('due_date'),
		dueDateVerbatim: text('due_date_verbatim'),
		promiseStrength: promiseStrength('promise_strength'),
		sourceAnchorId: uuid('source_anchor_id').references(() => sourceAnchors.id, {
			onDelete: 'set null'
		}),
		linkedNoteId: uuid('linked_note_id').references(() => notes.id, { onDelete: 'set null' }),
		provenanceId: uuid('provenance_id').references(() => provenance.id, { onDelete: 'set null' }),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		...timestamps
	},
	(table) => [
		index('todos_user_status_due_idx').on(table.userId, table.status, table.dueDate),
		index('todos_project_status_idx').on(table.projectId, table.status),
		index('todos_waiting_due_idx').on(table.userId, table.responsibility, table.dueDate)
	]
);

export const noteRelationships = pgTable(
	'note_relationships',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		sourceNoteId: uuid('source_note_id')
			.notNull()
			.references(() => notes.id, { onDelete: 'cascade' }),
		targetNoteId: uuid('target_note_id')
			.notNull()
			.references(() => notes.id, { onDelete: 'cascade' }),
		kind: relationshipKind('kind').notNull(),
		justification: text('justification'),
		sourceAnchorId: uuid('source_anchor_id').references(() => sourceAnchors.id, {
			onDelete: 'set null'
		}),
		provenanceId: uuid('provenance_id').references(() => provenance.id, { onDelete: 'set null' }),
		...timestamps
	},
	(table) => [
		uniqueIndex('note_relationships_unique').on(table.sourceNoteId, table.targetNoteId, table.kind),
		index('note_relationships_target_kind_idx').on(table.targetNoteId, table.kind),
		check('note_relationships_not_self', sql`${table.sourceNoteId} <> ${table.targetNoteId}`)
	]
);

export const references = pgTable(
	'references',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		noteId: uuid('note_id')
			.notNull()
			.references(() => notes.id, { onDelete: 'cascade' }),
		url: text('url').notNull(),
		title: text('title').notNull(),
		tier: referenceTier('tier').notNull(),
		relevanceNote: text('relevance_note').notNull(),
		sourceAnchorId: uuid('source_anchor_id').references(() => sourceAnchors.id, {
			onDelete: 'set null'
		}),
		provenanceId: uuid('provenance_id').references(() => provenance.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('references_note_idx').on(table.noteId)]
);

export const diagrams = pgTable(
	'diagrams',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		noteId: uuid('note_id')
			.notNull()
			.references(() => notes.id, { onDelete: 'cascade' }),
		kind: diagramKind('kind').notNull(),
		title: text('title'),
		source: text('source').notNull(),
		renderedSvg: text('rendered_svg'),
		searchableText: text('searchable_text').notNull().default(''),
		promotedFromId: uuid('promoted_from_id').references((): AnyPgColumn => diagrams.id, {
			onDelete: 'set null'
		}),
		sourceAnchorId: uuid('source_anchor_id').references(() => sourceAnchors.id, {
			onDelete: 'set null'
		}),
		provenanceId: uuid('provenance_id').references(() => provenance.id, { onDelete: 'set null' }),
		...timestamps
	},
	(table) => [
		index('diagrams_note_idx').on(table.noteId),
		index('diagrams_project_idx').on(table.projectId)
	]
);

export const skills = pgTable(
	'skills',
	{
		noteId: uuid('note_id')
			.primaryKey()
			.references(() => notes.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		description: text('description').notNull(),
		triggerHints: text('trigger_hints')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		license: text('license'),
		compatibility: text('compatibility'),
		metadata: jsonb('metadata').$type<Record<string, string>>().notNull().default({}),
		allowImplicitInvocation: boolean('allow_implicit_invocation').notNull().default(true),
		isEnabled: boolean('is_enabled').notNull().default(true),
		...timestamps
	},
	(table) => [
		index('skills_enabled_idx').on(table.isEnabled),
		uniqueIndex('skills_note_slug_unique').on(table.noteId, table.slug)
	]
);

export const projectSkillPins = pgTable(
	'project_skill_pins',
	{
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		skillNoteId: uuid('skill_note_id')
			.notNull()
			.references(() => skills.noteId, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [primaryKey({ columns: [table.projectId, table.skillNoteId] })]
);

export const attachments = pgTable(
	'attachments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		noteId: uuid('note_id').references(() => notes.id, { onDelete: 'cascade' }),
		path: text('path').notNull(),
		currentVersionId: uuid('current_version_id'),
		...timestamps
	},
	(table) => [
		uniqueIndex('attachments_note_path_unique')
			.on(table.noteId, table.path)
			.where(sql`${table.noteId} is not null`),
		uniqueIndex('attachments_project_path_unique')
			.on(table.projectId, table.path)
			.where(sql`${table.noteId} is null`),
		index('attachments_project_idx').on(table.projectId),
		index('attachments_note_idx').on(table.noteId)
	]
);

export const attachmentVersions = pgTable(
	'attachment_versions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		attachmentId: uuid('attachment_id')
			.notNull()
			.references(() => attachments.id, { onDelete: 'cascade' }),
		objectKey: text('object_key').notNull(),
		mediaType: text('media_type').notNull(),
		byteSize: integer('byte_size').notNull(),
		checksumSha256: text('checksum_sha256').notNull(),
		parserKind: text('parser_kind'),
		extractedText: text('extracted_text'),
		processingStatus: text('processing_status').notNull().default('queued'),
		processingFailure: text('processing_failure'),
		processedAt: timestamp('processed_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [uniqueIndex('attachment_versions_object_key_unique').on(table.objectKey)]
);

export const noteRevisionAttachments = pgTable(
	'note_revision_attachments',
	{
		noteRevisionId: uuid('note_revision_id')
			.notNull()
			.references(() => noteRevisions.id, { onDelete: 'cascade' }),
		attachmentVersionId: uuid('attachment_version_id')
			.notNull()
			.references(() => attachmentVersions.id, { onDelete: 'restrict' }),
		path: text('path').notNull()
	},
	(table) => [primaryKey({ columns: [table.noteRevisionId, table.path] })]
);

export const attachmentUploads = pgTable(
	'attachment_uploads',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		noteId: uuid('note_id').references(() => notes.id, { onDelete: 'cascade' }),
		path: text('path').notNull(),
		objectKey: text('object_key').notNull(),
		mediaType: text('media_type').notNull(),
		byteSize: integer('byte_size').notNull(),
		checksumSha256: text('checksum_sha256').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('attachment_uploads_expiry_idx').on(table.expiresAt)]
);

export const skillUsages = pgTable(
	'skill_usages',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		skillNoteId: uuid('skill_note_id')
			.notNull()
			.references(() => skills.noteId, { onDelete: 'cascade' }),
		contextNoteId: uuid('context_note_id').references(() => notes.id, { onDelete: 'set null' }),
		provenanceId: uuid('provenance_id').references(() => provenance.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('skill_usages_skill_created_idx').on(table.skillNoteId, table.createdAt)]
);

export const suggestions = pgTable(
	'suggestions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		noteId: uuid('note_id').references(() => notes.id, { onDelete: 'cascade' }),
		kind: suggestionKind('kind').notNull(),
		status: suggestionStatus('status').notNull().default('proposed'),
		payload: jsonb('payload').$type<JsonObject>().notNull(),
		confidence: integer('confidence'),
		provenanceId: uuid('provenance_id')
			.notNull()
			.references(() => provenance.id, { onDelete: 'restrict' }),
		sourceAnchorId: uuid('source_anchor_id').references(() => sourceAnchors.id, {
			onDelete: 'set null'
		}),
		decidedAt: timestamp('decided_at', { withTimezone: true }),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		appliedArtifactType: text('applied_artifact_type'),
		appliedArtifactId: uuid('applied_artifact_id'),
		isAutoAccepted: boolean('is_auto_accepted').notNull().default(false),
		...timestamps
	},
	(table) => [
		index('suggestions_inbox_idx').on(table.userId, table.status, table.createdAt),
		index('suggestions_note_status_idx').on(table.noteId, table.status),
		check(
			'suggestions_confidence_range',
			sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 100)`
		)
	]
);

export const trustPolicies = pgTable(
	'trust_policies',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		pipeline: pipelineKind('pipeline').notNull(),
		autoAcceptEnabled: boolean('auto_accept_enabled').notNull().default(false),
		minimumConfidence: integer('minimum_confidence'),
		conditions: jsonb('conditions').$type<JsonObject>().notNull().default({}),
		...timestamps
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.pipeline] }),
		check(
			'trust_policies_confidence_range',
			sql`${table.minimumConfidence} is null or (${table.minimumConfidence} >= 0 and ${table.minimumConfidence} <= 100)`
		)
	]
);

export const conversations = pgTable(
	'conversations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		kind: conversationKind('kind').notNull().default('chat'),
		contextProjectId: uuid('context_project_id').references(() => projects.id, {
			onDelete: 'set null'
		}),
		contextNoteId: uuid('context_note_id').references(() => notes.id, { onDelete: 'set null' }),
		title: text('title'),
		modelOverride: text('model_override'),
		visionModelOverride: text('vision_model_override'),
		executionModeOverride: agentExecutionMode('execution_mode_override'),
		...timestamps
	},
	(table) => [index('conversations_user_updated_idx').on(table.userId, table.updatedAt)]
);

export const agentPreferences = pgTable('agent_preferences', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	defaultModel: text('default_model'),
	defaultVisionModel: text('default_vision_model'),
	executionMode: agentExecutionMode('execution_mode').notNull().default('approval_required'),
	inlineSuggestionsEnabled: boolean('inline_suggestions_enabled').notNull().default(true),
	...timestamps
});

/**
 * Which agent tools the user has turned off. Rows are sparse: an absent tool is
 * enabled, so the default surface needs no rows at all and a newly added tool is
 * available without a backfill.
 *
 * `tool_name` is plain text rather than an enum because the tool list lives in
 * code. A renamed or deleted tool must decay into an ignored row, not a failed
 * migration.
 */
export const toolPreferences = pgTable(
	'tool_preferences',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		toolName: text('tool_name').notNull(),
		enabled: boolean('enabled').notNull(),
		...timestamps
	},
	(table) => [primaryKey({ columns: [table.userId, table.toolName] })]
);

/** Per-project departures from `tool_preferences`; an absent row defers to it. */
export const projectToolOverrides = pgTable(
	'project_tool_overrides',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		toolName: text('tool_name').notNull(),
		enabled: boolean('enabled').notNull(),
		...timestamps
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.projectId, table.toolName] }),
		index('project_tool_overrides_project_idx').on(table.userId, table.projectId)
	]
);

export const agentRuns = pgTable(
	'agent_runs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		conversationId: uuid('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		model: text('model').notNull(),
		executionMode: agentExecutionMode('execution_mode').notNull(),
		status: agentRunStatus('status').notNull().default('queued'),
		requestId: text('request_id')
			.notNull()
			.default(sql`gen_random_uuid()::text`),
		cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
		startedAt: timestamp('started_at', { withTimezone: true }),
		finishedAt: timestamp('finished_at', { withTimezone: true }),
		provenanceId: uuid('provenance_id').references(() => provenance.id, { onDelete: 'set null' }),
		serializedState: text('serialized_state'),
		pendingDecisions: jsonb('pending_decisions')
			.$type<readonly JsonObject[]>()
			.notNull()
			.default([]),
		failure: text('failure'),
		providerErrorCode: text('provider_error_code'),
		contextSnapshot: jsonb('context_snapshot').$type<JsonObject>().notNull().default({}),
		inputSnapshot: jsonb('input_snapshot').$type<JsonObject>().notNull().default({}),
		retryOfRunId: uuid('retry_of_run_id').references((): AnyPgColumn => agentRuns.id, {
			onDelete: 'set null'
		}),
		definitionVersion: integer('definition_version').notNull().default(1),
		...timestamps
	},
	(table) => [
		uniqueIndex('agent_runs_user_request_unique').on(table.userId, table.requestId),
		uniqueIndex('agent_runs_active_conversation_unique')
			.on(table.conversationId)
			.where(sql`${table.status} in ('queued', 'running', 'awaiting_approval', 'cancelling')`),
		index('agent_runs_user_updated_idx').on(table.userId, table.updatedAt),
		index('agent_runs_conversation_status_idx').on(table.conversationId, table.status)
	]
);

export const agentRunEvents = pgTable(
	'agent_run_events',
	{
		cursor: bigint('cursor', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
		runId: uuid('run_id')
			.notNull()
			.references(() => agentRuns.id, { onDelete: 'cascade' }),
		attempt: integer('attempt').notNull(),
		event: jsonb('event').$type<JsonObject>().notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('agent_run_events_run_cursor_idx').on(table.runId, table.cursor)]
);

export const agentRunDecisions = pgTable(
	'agent_run_decisions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		runId: uuid('run_id')
			.notNull()
			.references(() => agentRuns.id, { onDelete: 'cascade' }),
		callId: text('call_id').notNull(),
		decision: agentRunDecision('decision').notNull(),
		message: text('message'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		consumedAt: timestamp('consumed_at', { withTimezone: true })
	},
	(table) => [uniqueIndex('agent_run_decisions_run_call_unique').on(table.runId, table.callId)]
);

export const agentSessionItems = pgTable(
	'agent_session_items',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		conversationId: uuid('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		item: jsonb('item').$type<JsonObject>().notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('agent_session_items_position_unique').on(table.conversationId, table.position),
		index('agent_session_items_conversation_idx').on(table.conversationId, table.position)
	]
);

export const messages = pgTable(
	'messages',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		conversationId: uuid('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
		eventCursor: bigint('event_cursor', { mode: 'bigint' }).references(
			() => agentRunEvents.cursor,
			{ onDelete: 'set null' }
		),
		role: messageRole('role').notNull(),
		content: jsonb('content').$type<JsonObject>().notNull(),
		model: text('model'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('messages_conversation_created_idx').on(table.conversationId, table.createdAt),
		uniqueIndex('messages_event_cursor_unique').on(table.eventCursor),
		uniqueIndex('messages_assistant_run_unique')
			.on(table.runId)
			.where(sql`${table.role} = 'assistant' and ${table.runId} is not null`)
	]
);

// Durable, user-controlled remembered facts. Project-scoped entries surface to agents
// via retrieval; entries without a project form the user's profile memory and are
// injected into every agent run. Entries changed through suggestions are
// soft-deleted/superseded so accepts can be reverted.
export const memoryEntries = pgTable(
	'memory_entries',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
		content: text('content').notNull(),
		type: memoryEntryType('type'),
		shareWithAgents: boolean('share_with_agents').notNull().default(true),
		provenanceId: uuid('provenance_id').references(() => provenance.id, { onDelete: 'set null' }),
		replacesEntryId: uuid('replaces_entry_id').references((): AnyPgColumn => memoryEntries.id, {
			onDelete: 'set null'
		}),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),
		...timestamps
	},
	(table) => [
		index('memory_entries_project_active_idx').on(
			table.projectId,
			table.deletedAt,
			table.updatedAt
		),
		index('memory_entries_user_idx').on(table.userId)
	]
);

// Retrieval units are separate from notes so large notes and diagram labels can be
// independently embedded and reranked. The selected embedding model emits 3072 dimensions.
// Each chunk has exactly one source: a note (diagram chunks also carry the note) or a
// memory entry.
export const searchChunks = pgTable(
	'search_chunks',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		noteId: uuid('note_id').references(() => notes.id, { onDelete: 'cascade' }),
		memoryEntryId: uuid('memory_entry_id').references(() => memoryEntries.id, {
			onDelete: 'cascade'
		}),
		attachmentId: uuid('attachment_id').references(() => attachments.id, { onDelete: 'cascade' }),
		attachmentPath: text('attachment_path'),
		sourceTitle: text('source_title'),
		sectionPath: text('section_path'),
		diagramId: uuid('diagram_id').references(() => diagrams.id, { onDelete: 'cascade' }),
		sourceAnchorId: uuid('source_anchor_id').references(() => sourceAnchors.id, {
			onDelete: 'set null'
		}),
		content: text('content').notNull(),
		embedding: halfvec('embedding', { dimensions: 3072 }),
		embeddingModel: text('embedding_model'),
		contentHash: text('content_hash').notNull(),
		sourceRevision: integer('source_revision').notNull().default(1),
		sourceCreatedAt: timestamp('source_created_at', { withTimezone: true }).notNull().defaultNow(),
		chunkIndex: integer('chunk_index').notNull().default(0),
		// Set when a newer revision of the source has been staged but not yet embedded.
		// Superseded rows stay searchable by embedding (stale content beats no content)
		// and are dropped once their replacements carry vectors. See the worker at
		// `$lib/server/services/retrieval/index-maintenance`.
		supersededAt: timestamp('superseded_at', { withTimezone: true }),
		...timestamps
	},
	(table) => [
		index('search_chunks_note_idx').on(table.noteId),
		index('search_chunks_memory_idx').on(table.memoryEntryId),
		index('search_chunks_attachment_idx').on(table.attachmentId),
		index('search_chunks_user_idx').on(table.userId),
		index('search_chunks_project_idx').on(table.projectId),
		// The backfill worker's queue is the data itself: every tick scans for chunks
		// awaiting a vector, so keep that scan proportional to the backlog, not the table.
		index('search_chunks_pending_idx')
			.on(table.userId)
			.where(sql`embedding is null`),
		check(
			'search_chunks_single_source',
			sql`num_nonnulls(${table.noteId}, ${table.memoryEntryId}, ${table.attachmentId}) = 1`
		)
	]
);

export const projectTemplates = pgTable(
	'project_templates',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		objectKey: text('object_key').notNull(),
		mediaType: text('media_type').notNull(),
		byteSize: integer('byte_size').notNull(),
		extractedStyles: jsonb('extracted_styles').$type<JsonObject>().notNull().default({}),
		isDefault: boolean('is_default').notNull().default(false),
		...timestamps
	},
	(table) => [
		uniqueIndex('project_templates_project_name_unique').on(table.projectId, table.name),
		index('project_templates_project_idx').on(table.projectId)
	]
);

// Per-project document export preferences (font, line height, margins).
export const exportSettings = pgTable(
	'export_settings',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		settings: jsonb('settings').$type<JsonObject>().notNull().default({}),
		...timestamps
	},
	(table) => [primaryKey({ columns: [table.userId, table.projectId] })]
);

export const artifacts = pgTable(
	'artifacts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		format: text('format').notNull(),
		objectKey: text('object_key').notNull(),
		byteSize: integer('byte_size').notNull(),
		sourceNoteIds: jsonb('source_note_ids').$type<string[]>().notNull(),
		templateId: uuid('template_id').references(() => projectTemplates.id, { onDelete: 'set null' }),
		provenanceId: uuid('provenance_id').references(() => provenance.id, { onDelete: 'set null' }),
		runId: text('run_id'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('artifacts_project_created_idx').on(table.projectId, table.createdAt),
		index('artifacts_user_idx').on(table.userId)
	]
);

export const feedbackReports = pgTable(
	'feedback_reports',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		body: text('body').notNull(),
		url: text('url').notNull(),
		appContext: jsonb('app_context').$type<JsonObject>().notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('feedback_reports_user_created_idx').on(table.userId, table.createdAt)]
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type NoteRevision = typeof noteRevisions.$inferSelect;
export type Todo = typeof todos.$inferSelect;
export type Suggestion = typeof suggestions.$inferSelect;
export type Artifact = typeof artifacts.$inferSelect;
export type ProjectTemplate = typeof projectTemplates.$inferSelect;
export type ToolPreferenceRow = typeof toolPreferences.$inferSelect;
export type ProjectToolOverrideRow = typeof projectToolOverrides.$inferSelect;
