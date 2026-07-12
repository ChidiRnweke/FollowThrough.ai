import { sql } from 'drizzle-orm';
import {
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
export const todoResponsibility = pgEnum('todo_responsibility', ['mine', 'waiting_on']);
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
	'diagram'
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
	'agent'
]);
export const referenceTier = pgEnum('reference_tier', [
	'official',
	'standard',
	'vendor',
	'community'
]);
export const messageRole = pgEnum('message_role', ['user', 'assistant', 'tool']);

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
		...timestamps
	},
	(table) => [uniqueIndex('users_email_unique').on(sql`lower(${table.email})`)]
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
		document: jsonb('document')
			.$type<ProseMirrorDocument>()
			.notNull()
			.default({ type: 'doc', content: [] }),
		plainText: text('plain_text').notNull().default(''),
		currentRevision: integer('current_revision').notNull().default(1),
		isPinned: boolean('is_pinned').notNull().default(false),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		...timestamps
	},
	(table) => [
		index('notes_user_updated_idx').on(table.userId, table.updatedAt),
		index('notes_project_parent_position_idx').on(table.projectId, table.parentId, table.position),
		index('notes_parent_idx').on(table.parentId),
		index('notes_user_kind_idx').on(table.userId, table.kind)
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
		waitingOn: text('waiting_on'),
		dueDate: date('due_date'),
		dueDateVerbatim: text('due_date_verbatim'),
		promiseStrength: promiseStrength('promise_strength'),
		sourceAnchorId: uuid('source_anchor_id').references(() => sourceAnchors.id, {
			onDelete: 'set null'
		}),
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
		description: text('description').notNull(),
		triggerHints: text('trigger_hints')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		isEnabled: boolean('is_enabled').notNull().default(true),
		...timestamps
	},
	(table) => [index('skills_enabled_idx').on(table.isEnabled)]
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
		contextNoteId: uuid('context_note_id').references(() => notes.id, { onDelete: 'set null' }),
		title: text('title'),
		...timestamps
	},
	(table) => [index('conversations_user_updated_idx').on(table.userId, table.updatedAt)]
);

export const messages = pgTable(
	'messages',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		conversationId: uuid('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		role: messageRole('role').notNull(),
		content: jsonb('content').$type<JsonObject>().notNull(),
		model: text('model'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('messages_conversation_created_idx').on(table.conversationId, table.createdAt)]
);

// Retrieval units are separate from notes so large notes and diagram labels can be
// independently embedded and reranked. The selected embedding model emits 3072 dimensions.
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
		noteId: uuid('note_id')
			.notNull()
			.references(() => notes.id, { onDelete: 'cascade' }),
		diagramId: uuid('diagram_id').references(() => diagrams.id, { onDelete: 'cascade' }),
		sourceAnchorId: uuid('source_anchor_id').references(() => sourceAnchors.id, {
			onDelete: 'set null'
		}),
		content: text('content').notNull(),
		embedding: halfvec('embedding', { dimensions: 3072 }),
		embeddingModel: text('embedding_model'),
		contentHash: text('content_hash').notNull(),
		sourceRevision: integer('source_revision').notNull().default(1),
		chunkIndex: integer('chunk_index').notNull().default(0),
		...timestamps
	},
	(table) => [
		index('search_chunks_note_idx').on(table.noteId),
		index('search_chunks_user_idx').on(table.userId),
		index('search_chunks_project_idx').on(table.projectId)
	]
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type NoteRevision = typeof noteRevisions.$inferSelect;
export type Todo = typeof todos.$inferSelect;
export type Suggestion = typeof suggestions.$inferSelect;
