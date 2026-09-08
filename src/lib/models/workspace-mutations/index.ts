import type {
	MemoryEntry,
	MemoryEntryId,
	CreateMemoryEntryInput,
	UpdateMemoryEntryInput
} from '$lib/models/memory';
import { z } from 'zod';
import { exportSettingsOverlaySchema } from '$lib/models/deliverables';
import { applyAgentPreferenceUpdate, type UpdateAgentPreferencesInput } from '$lib/models/agent';
import type { DiagramId, DiagramRevisionId } from '$lib/models/diagrams';
import { applyTodoEdit, type Todo, type UpdateTodoInput } from '$lib/models/todos';
import type { Project, ProjectId } from '$lib/models/projects';
import type { UserId } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import { noteEtag, noteSyncContentEquals, type Note, type NoteId } from '$lib/models/notes';
import type {
	WriteContent,
	WriteDraft,
	WriteObservation,
	WriteBaseResolution,
	ServerResource
} from '$lib/models/outbox';
import { syncEtagSchema } from '$lib/models/sync';
import {
	resourceDataSchemas,
	noteRecordSchema,
	projectRecordSchema,
	todoRecordSchema,
	workspaceObjectReadSchema,
	workspaceWriteReceiptSchema,
	workspaceRecordIdentity,
	type WorkspaceRecord,
	type WorkspaceValues
} from '$lib/models/workspace-records';
import { workspaceResourceKey, type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';

const noteId = noteRecordSchema.shape.id;
const projectId = projectRecordSchema.shape.id;
const todoId = todoRecordSchema.shape.id;
const diagramId = z
	.string()
	.uuid()
	.transform((value) => value as DiagramId);

const memoryEntryId = resourceDataSchemas.memory_entries.shape.id;
const agentPreferencePatchSchema = resourceDataSchemas.agent_preferences
	.pick({
		defaultModel: true,
		defaultVisionModel: true,
		inlineModel: true,
		attachmentVisionModel: true,
		webSearchEngine: true,
		webSearchMaxResults: true,
		webSearchMaxTotalResults: true,
		agentMaxTurns: true,
		executionMode: true,
		inlineSuggestionsEnabled: true
	})
	.partial()
	.extend({
		defaultModel: z.string().nullable().optional(),
		defaultVisionModel: z.string().nullable().optional(),
		inlineModel: z.string().nullable().optional(),
		attachmentVisionModel: z.string().nullable().optional(),
		webSearchEngine: resourceDataSchemas.agent_preferences.shape.webSearchEngine.nullable(),
		webSearchMaxResults: z.number().nullable().optional(),
		webSearchMaxTotalResults: z.number().nullable().optional(),
		agentMaxTurns: z.number().nullable().optional()
	});
export const workspaceCommandSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('updateUserPreferences'),
		userId: resourceDataSchemas.user_preferences.shape.userId,
		sectionNumberingDefault: z.boolean()
	}),
	z.object({
		kind: z.literal('updateAgentPreferences'),
		userId: resourceDataSchemas.agent_preferences.shape.userId,
		patch: agentPreferencePatchSchema
	}),
	z.object({
		kind: z.literal('updateExportSettings'),
		userId: resourceDataSchemas.export_settings.shape.userId,
		projectId,
		settings: exportSettingsOverlaySchema
			.required({ fontFamily: true, fontSize: true, lineHeight: true, margin: true })
			.extend({
				fontSize: z.number().min(8).max(18),
				lineHeight: z.number().min(1).max(2.2),
				margin: z.number().min(18).max(144)
			})
	}),
	z.object({
		kind: z.literal('createMemory'),
		id: memoryEntryId,
		projectId: projectId.optional(),
		content: z.string().trim().min(1),
		type: resourceDataSchemas.memory_entries.shape.type,
		shareWithAgents: z.boolean()
	}),
	z.object({
		kind: z.literal('updateMemory'),
		memoryEntryId,
		content: z.string().trim().min(1).optional(),
		type: resourceDataSchemas.memory_entries.shape.type.nullable(),
		shareWithAgents: z.boolean().optional()
	}),
	z.object({ kind: z.literal('deleteMemory'), memoryEntryId }),
	z.object({ kind: z.literal('createProject'), id: projectId, name: z.string().trim().min(1) }),
	z.object({ kind: z.literal('renameProject'), projectId, name: z.string().trim().min(1) }),
	z.object({ kind: z.literal('archiveProject'), projectId }),
	z.object({ kind: z.literal('projectNumbering'), projectId, enabled: z.boolean().optional() }),
	z.object({
		kind: z.literal('createFolder'),
		id: noteId,
		projectId,
		parentId: noteId.optional(),
		name: z.string().trim().min(1)
	}),
	z.object({
		kind: z.literal('createNote'),
		id: noteId,
		projectId,
		parentId: noteId.optional(),
		title: z.string().trim().min(1)
	}),
	z.object({
		kind: z.literal('createSkill'),
		id: noteId,
		projectId,
		parentId: noteId.optional(),
		name: z.string().trim().min(1),
		description: z.string().optional()
	}),
	z.object({
		kind: z.literal('updateSkill'),
		noteId,
		displayName: z.string().trim().min(1).optional(),
		description: z.string().optional(),
		isEnabled: z.boolean().optional()
	}),
	z.object({ kind: z.literal('renameNote'), noteId, title: z.string().trim().min(1) }),
	z.object({
		kind: z.literal('saveNote'),
		noteId,
		document: noteRecordSchema.shape.document,
		plainText: z.string(),
		title: z.string().trim().min(1).optional(),
		isPinned: z.boolean().optional(),
		sectionNumbering: z.boolean().nullable().optional()
	}),
	z.object({ kind: z.literal('archiveNote'), noteId }),
	z.object({ kind: z.literal('restoreNote'), noteId }),
	z.object({ kind: z.literal('publishNote'), noteId }),
	z.object({ kind: z.literal('discardNoteDraft'), noteId }),
	z.object({ kind: z.literal('deleteNote'), noteId }),
	z.object({ kind: z.literal('noteNumbering'), noteId, enabled: z.boolean().optional() }),
	z.object({
		kind: z.literal('moveNote'),
		projectId,
		entryId: noteId,
		parentId: noteId.optional(),
		position: z.number().int().nonnegative()
	}),
	z.object({
		kind: z.literal('createTodo'),
		id: todoId,
		projectId,
		title: z.string().trim().min(1),
		responsibility: todoRecordSchema.shape.responsibility,
		status: todoRecordSchema.shape.status.optional()
	}),
	z.object({
		kind: z.literal('updateTodo'),
		todoId,
		status: todoRecordSchema.shape.status.optional(),
		title: z.string().trim().min(1).optional(),
		description: z.string().nullable().optional(),
		dueDate: todoRecordSchema.shape.dueDate.nullable(),
		responsibility: todoRecordSchema.shape.responsibility.optional(),
		priority: todoRecordSchema.shape.priority.nullable(),
		category: z.string().nullable().optional(),
		waitingOn: z.string().nullable().optional(),
		linkedNoteId: noteId.nullable().optional()
	}),
	z.object({ kind: z.literal('deleteTodo'), todoId }),
	z.object({ kind: z.literal('saveDiagram'), diagramId, source: z.string().min(1).max(2_000_000) }),
	z.object({
		kind: z.literal('renameDiagram'),
		diagramId,
		title: z.string().trim().min(1).max(200)
	}),
	z.object({
		kind: z.literal('publishDiagram'),
		diagramId,
		source: z.string().min(1).max(2_000_000),
		renderedSvg: z.string().min(1).max(3_000_000)
	}),
	z.object({
		kind: z.literal('restoreDiagramRevision'),
		diagramId,
		revisionId: z
			.string()
			.uuid()
			.transform((value) => value as DiagramRevisionId)
	}),
	z.object({ kind: z.literal('archiveDiagram'), diagramId }),
	z.object({ kind: z.literal('restoreDiagram'), diagramId }),
	z.object({ kind: z.literal('deleteDiagram'), diagramId })
]);
export type WorkspaceCommand = z.infer<typeof workspaceCommandSchema>;

export const workspaceMutationRequestSchema = z.object({
	operationId: z.string().uuid(),
	baseEtag: syncEtagSchema.nullable(),
	command: workspaceCommandSchema
});
export type WorkspaceMutationRequest = z.infer<typeof workspaceMutationRequestSchema>;

type MutationFor<K extends WorkspaceCommand['kind']> = Omit<WorkspaceMutationRequest, 'command'> & {
	readonly command: Extract<WorkspaceCommand, { kind: K }>;
};
export type NoteMutationRequest = MutationFor<
	| 'createNote'
	| 'renameNote'
	| 'saveNote'
	| 'archiveNote'
	| 'restoreNote'
	| 'publishNote'
	| 'discardNoteDraft'
	| 'deleteNote'
	| 'noteNumbering'
>;
export type ProjectMutationRequest = MutationFor<
	| 'createProject'
	| 'renameProject'
	| 'archiveProject'
	| 'projectNumbering'
	| 'createFolder'
	| 'moveNote'
>;
export type TodoMutationRequest = MutationFor<'createTodo' | 'updateTodo' | 'deleteTodo'>;
export type UserPreferenceMutationRequest = MutationFor<'updateUserPreferences'>;
export type AgentPreferenceMutationRequest = MutationFor<'updateAgentPreferences'>;
export type DeliverableMutationRequest = MutationFor<'updateExportSettings'>;
export type MemoryMutationRequest = MutationFor<'createMemory' | 'updateMemory' | 'deleteMemory'>;
export type SkillMutationRequest = MutationFor<'createSkill' | 'updateSkill'>;
export type DiagramMutationRequest = MutationFor<
	| 'saveDiagram'
	| 'renameDiagram'
	| 'publishDiagram'
	| 'restoreDiagramRevision'
	| 'archiveDiagram'
	| 'restoreDiagram'
	| 'deleteDiagram'
>;

export const workspaceMutationResultSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('applied'), receipt: workspaceWriteReceiptSchema }),
	z.object({
		kind: z.literal('conflict'),
		remote: z.union([
			workspaceObjectReadSchema.options[0],
			workspaceObjectReadSchema.options[2],
			workspaceObjectReadSchema.options[3]
		])
	}),
	z.object({ kind: z.literal('rejected'), message: z.string() })
]);
export type WorkspaceMutationResult = z.infer<typeof workspaceMutationResultSchema>;

/** One identity rule for queue dependencies, optimistic views, guards, and receipts. */
export const mutationResource = (command: WorkspaceCommand): WorkspaceResourceIdentity => {
	switch (command.kind) {
		case 'updateUserPreferences':
			return { type: 'user_preferences', id: [command.userId] };
		case 'updateAgentPreferences':
			return { type: 'agent_preferences', id: [command.userId] };
		case 'updateExportSettings':
			return { type: 'export_settings', id: [command.userId, command.projectId] };
		case 'updateSkill':
			return { type: 'skills', id: [command.noteId] };
		case 'createMemory':
			return { type: 'memory_entries', id: [command.id] };
		case 'updateMemory':
		case 'deleteMemory':
			return { type: 'memory_entries', id: [command.memoryEntryId] };
		case 'saveDiagram':
		case 'renameDiagram':
		case 'publishDiagram':
		case 'restoreDiagramRevision':
		case 'archiveDiagram':
		case 'restoreDiagram':
		case 'deleteDiagram':
			return { type: 'diagrams', id: [command.diagramId] };
		case 'createProject':
			return { type: 'projects', id: [command.id] };
		case 'renameProject':
		case 'archiveProject':
		case 'projectNumbering':
			return { type: 'projects', id: [command.projectId] };
		case 'createFolder':
		case 'createNote':
		case 'createSkill':
			return { type: 'notes', id: [command.id] };
		case 'moveNote':
			return { type: 'notes', id: [command.entryId] };
		case 'createTodo':
			return { type: 'todos', id: [command.id] };
		case 'updateTodo':
		case 'deleteTodo':
			return { type: 'todos', id: [command.todoId] };
		default:
			return { type: 'notes', id: [command.noteId] };
	}
};

const legacyVersionSchema = z
	.object({ note: noteRecordSchema, etag: z.string() })
	.refine(
		(value) => value.etag === noteEtag(value.note),
		'The legacy note validator does not match its base'
	);
const legacyRecordFields = {
	userId: noteRecordSchema.shape.userId,
	noteId,
	base: legacyVersionSchema,
	local: noteRecordSchema,
	operationId: z.string().uuid(),
	editVersion: z.number().int().nonnegative(),
	updatedAt: noteRecordSchema.shape.updatedAt
};
/** The old store remains intact; this boundary proves the identities before importing a draft. */
export const legacyNoteSyncRecordSchema = z
	.discriminatedUnion('state', [
		z.object({ ...legacyRecordFields, state: z.literal('synced') }).strict(),
		z.object({
			...legacyRecordFields,
			state: z.enum(['pending', 'syncing']),
			remote: legacyVersionSchema.optional()
		}),
		z.object({ ...legacyRecordFields, state: z.literal('conflict'), remote: legacyVersionSchema })
	])
	.refine(
		(record) =>
			record.base.note.id === record.noteId &&
			record.local.id === record.noteId &&
			record.base.note.userId === record.userId &&
			record.local.userId === record.userId &&
			(record.state === 'synced' ||
				!record.remote ||
				(record.remote.note.id === record.noteId && record.remote.note.userId === record.userId)),
		'The saved draft belongs to a different resource or account'
	);
export type LegacyNoteSyncRecord = z.infer<typeof legacyNoteSyncRecordSchema>;
export type LegacyNoteImport = {
	readonly source: string;
	readonly draft: WriteDraft<WorkspaceCommand, WorkspaceRecord>;
	readonly conflict: WriteObservation<WorkspaceRecord> | null;
};
export const legacyNoteImport = (record: LegacyNoteSyncRecord): LegacyNoteImport | null => {
	if (record.state === 'synced') return null;
	const local = record.local;
	const base = record.base.note;
	return {
		source: `legacy-note:${record.noteId}:${record.operationId}:${record.editVersion}`,
		draft: {
			operationId: record.operationId,
			key: workspaceResourceKey({ type: 'notes', id: [record.noteId] }),
			command: {
				kind: 'saveNote',
				noteId: record.noteId,
				document: local.document,
				plainText: local.plainText,
				...(local.title !== base.title ? { title: local.title } : {}),
				...(local.isPinned !== base.isPinned ? { isPinned: local.isPinned } : {}),
				...(local.sectionNumbering !== base.sectionNumbering
					? { sectionNumbering: local.sectionNumbering ?? null }
					: {})
			},
			base: { etag: null, value: { type: 'notes', value: base } },
			basedOn: null,
			local: { type: 'notes', value: local },
			coalesce: 'document',
			references: []
		},
		conflict: record.remote
			? {
					kind: 'found',
					snapshot: { etag: null, value: { type: 'notes', value: record.remote.note } }
				}
			: null
	};
};

/** Old revision validators are never sent as workspace validators. Validate the preserved base first. */
export const resolveImportedNoteBase = (
	base: WorkspaceRecord,
	local: WorkspaceRecord | null,
	remote: ServerResource<WorkspaceRecord>
): WriteBaseResolution<WorkspaceRecord> => {
	const matches = (left: Note, right: Note) =>
		noteSyncContentEquals(left, right) && left.sectionNumbering === right.sectionNumbering;
	if (
		remote.kind === 'found' &&
		base.type === 'notes' &&
		remote.snapshot.value.type === 'notes' &&
		((base.value.currentRevision === remote.snapshot.value.value.currentRevision &&
			matches(base.value, remote.snapshot.value.value)) ||
			(local?.type === 'notes' && matches(local.value, remote.snapshot.value.value)))
	)
		return { kind: 'matched', snapshot: remote.snapshot };
	return { kind: 'conflict', remote };
};

/** Document editing contributes a command and local representation, never cache or retry behavior. */
export const noteWrite = (note: Note): WriteContent<WorkspaceCommand, WorkspaceRecord> => ({
	command: {
		kind: 'saveNote',
		noteId: note.id,
		document: note.document,
		plainText: note.plainText,
		title: note.title,
		isPinned: note.isPinned
	},
	local: { type: 'notes', value: note },
	coalesce: 'document',
	references: []
});

export const todoWrite = (
	todo: Todo,
	patch: Omit<UpdateTodoInput, 'todoId'>,
	timestamp: Todo['updatedAt']
): WriteContent<WorkspaceCommand, WorkspaceRecord> => ({
	command: { kind: 'updateTodo', todoId: todo.id, ...patch },
	local: { type: 'todos', value: applyTodoEdit(todo, patch, timestamp) },
	coalesce: null,
	references: patch.linkedNoteId
		? [workspaceResourceKey({ type: 'notes', id: [patch.linkedNoteId] })]
		: []
});

/** Initial representations use client IDs; server acknowledgment replaces only authoritative fields. */
export const newProject = (
	id: ProjectId,
	userId: UserId,
	name: string,
	timestamp: DateTime
): Project => ({
	id,
	userId,
	name: name.trim(),
	role: 'workspace',
	createdAt: timestamp,
	updatedAt: timestamp
});
export const newNote = (
	id: NoteId,
	project: Project,
	title: string,
	kind: 'note' | 'folder',
	entries: readonly Note[],
	timestamp: DateTime,
	parentId?: NoteId
): Note => {
	if (project.archivedAt) throw new Error('An archived project cannot receive new notes');
	if (parentId) {
		const parent = entries.find((entry) => entry.id === parentId && entry.projectId === project.id);
		if (!parent || parent.kind !== 'folder' || parent.archivedAt)
			throw new Error('An active parent folder is required');
	}
	return {
		id,
		userId: project.userId,
		projectId: project.id,
		parentId,
		kind,
		title: title.trim(),
		// Folder creation counts active tree entries; note creation counts all stored siblings.
		position: entries.filter(
			(entry) =>
				entry.projectId === project.id &&
				entry.parentId === parentId &&
				(kind === 'note' || !entry.archivedAt)
		).length,
		document: { type: 'doc', content: [] },
		plainText: '',
		currentRevision: 1,
		publishedRevision: 0,
		isPinned: false,
		createdAt: timestamp,
		updatedAt: timestamp
	};
};

/** Validate identity once for every feature that appends to the shared outbox. */
export const assertWorkspaceWriteIdentity = (
	draft: WriteDraft<WorkspaceCommand, WorkspaceRecord>
): void => {
	if (workspaceResourceKey(mutationResource(draft.command)) !== draft.key)
		throw new Error('The command belongs to a different resource');
	for (const record of [draft.local, draft.base?.value]) {
		if (record && workspaceResourceKey(workspaceRecordIdentity(record)) !== draft.key)
			throw new Error('The edit body belongs to a different resource');
	}
};

/** Pending publication commands determine the local view until authoritative revisions arrive. */
export const noteHasUnpublishedChanges = (
	note: Note,
	commands: readonly WorkspaceCommand[]
): boolean => {
	let unpublished = note.currentRevision > note.publishedRevision;
	for (const command of commands) {
		if (!('noteId' in command) || command.noteId !== note.id) continue;
		if (command.kind === 'saveNote' || command.kind === 'renameNote') unpublished = true;
		if (command.kind === 'publishNote' || command.kind === 'discardNoteDraft') unpublished = false;
	}
	return unpublished;
};

/** Match the trash placement rules while retaining the complete local note. */
export const noteTrashWrite = (
	note: Note,
	action: 'archive' | 'restore',
	notes: readonly Note[],
	timestamp: DateTime
): WriteContent<WorkspaceCommand, WorkspaceRecord> => {
	if (action === 'archive') {
		if (note.archivedAt) throw new Error('The note is already archived');
		if (
			note.kind === 'folder' &&
			notes.some((entry) => entry.parentId === note.id && !entry.archivedAt)
		)
			throw new Error('A folder with active contents cannot be archived');
		return {
			command: { kind: 'archiveNote', noteId: note.id },
			local: { type: 'notes', value: { ...note, archivedAt: timestamp, updatedAt: timestamp } },
			coalesce: null,
			references: []
		};
	}
	if (!note.archivedAt) throw new Error('The note is not archived');
	const { archivedAt, ...rest } = note;
	void archivedAt;
	const parent = notes.find((entry) => entry.id === note.parentId);
	const orphaned = Boolean(note.parentId) && (!parent || Boolean(parent.archivedAt));
	const { parentId, ...detached } = rest;
	void parentId;
	const local: Note = orphaned
		? {
				...detached,
				position: notes.filter((entry) => entry.projectId === note.projectId && !entry.parentId)
					.length,
				updatedAt: timestamp
			}
		: { ...rest, updatedAt: timestamp };
	return {
		command: { kind: 'restoreNote', noteId: note.id },
		local: { type: 'notes', value: local },
		coalesce: null,
		references: local.parentId
			? [workspaceResourceKey({ type: 'notes', id: [local.parentId] })]
			: []
	};
};

export const newMemory = (
	id: MemoryEntryId,
	userId: UserId,
	input: CreateMemoryEntryInput,
	timestamp: DateTime
): MemoryEntry => ({
	id,
	userId,
	projectId: input.projectId,
	content: input.content.trim(),
	type: input.type,
	shareWithAgents: input.shareWithAgents ?? true,
	createdAt: timestamp,
	updatedAt: timestamp
});
export const memoryWrite = (
	entry: MemoryEntry,
	patch: Omit<UpdateMemoryEntryInput, 'memoryEntryId'>
): WriteContent<WorkspaceCommand, WorkspaceRecord> => ({
	command: { kind: 'updateMemory', memoryEntryId: entry.id, ...patch },
	local: {
		type: 'memory_entries',
		value: {
			...entry,
			...patch,
			content: patch.content?.trim() ?? entry.content,
			shareWithAgents: patch.shareWithAgents ?? entry.shareWithAgents,
			type: patch.type === null ? undefined : (patch.type ?? entry.type)
		}
	},
	coalesce: null,
	references: []
});

export const skillMetadataWrite = (
	entry: WorkspaceValues['skills'],
	patch: Omit<Extract<WorkspaceCommand, { kind: 'updateSkill' }>, 'kind' | 'noteId'>
): WriteContent<WorkspaceCommand, WorkspaceRecord> => ({
	command: { kind: 'updateSkill', noteId: entry.noteId, ...patch },
	local: {
		type: 'skills',
		value: {
			...entry,
			name: patch.displayName?.trim() || entry.name,
			description: patch.description?.trim() || entry.description,
			isEnabled: patch.isEnabled ?? entry.isEnabled
		}
	},
	coalesce: null,
	references: []
});

export const agentPreferenceWrite = (
	entry: WorkspaceValues['agent_preferences'],
	patch: UpdateAgentPreferencesInput
): WriteContent<WorkspaceCommand, WorkspaceRecord> => ({
	command: { kind: 'updateAgentPreferences', userId: entry.userId, patch },
	local: { type: 'agent_preferences', value: applyAgentPreferenceUpdate(entry, patch) },
	coalesce: null,
	references: []
});
