import { applyTodoEdit } from '$lib/services/todos/edits';
import { decideNoteCreation } from '$lib/services/notes/creation';
import { decideProjectDetails } from '$lib/services/projects/details';
import { decideRevisionWrite } from '$lib/models/revisions';
import { applySkillMetadataEdit } from '$lib/services/skills/metadata';
import { decideMemoryCreation, decideMemoryEdit } from '$lib/services/memory/edits';
import type {
	MemoryEntry,
	MemoryEntryId,
	CreateMemoryEntryInput,
	UpdateMemoryEntryInput
} from '$lib/models/memory';
import { applyAgentPreferenceUpdate, type UpdateAgentPreferencesInput } from '$lib/models/agent';
import { decideDiagramTrash } from '$lib/models/diagrams';
import { decideTodoCreation, type Todo, type UpdateTodoInput } from '$lib/models/todos';
import type { Project, ProjectId } from '$lib/models/projects';
import type { UserId } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import {
	applyNoteDraftEdit,
	decideNoteArchive,
	decideNoteRestore,
	type Note,
	type NoteId
} from '$lib/models/notes';
import type { WriteContent } from '$lib/models/outbox';
import {
	isWorkspaceRecord,
	type WorkspaceRecord,
	type WorkspaceValues
} from '$lib/models/workspace-records';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import type {
	WorkspaceCommand,
	PreparedWorkspaceCommand,
	WorkspaceCommandContext
} from '$lib/models/workspace-mutations';
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
): Project => {
	const decision = decideProjectDetails({ name });
	if (decision.kind === 'invalid') throw new Error(decision.message);
	return {
		id,
		userId,
		name: decision.name,
		role: 'workspace',
		createdAt: timestamp,
		updatedAt: timestamp
	};
};

export const newNote = (
	id: NoteId,
	project: Project,
	title: string,
	kind: 'note' | 'folder',
	entries: readonly Note[],
	timestamp: DateTime,
	parentId?: NoteId
): Note => {
	const decision = decideNoteCreation(
		{ id, title, kind, parentId },
		{
			project,
			parent: entries.find((entry) => entry.id === parentId) ?? null,
			siblingCount: entries.filter(
				(entry) => entry.projectId === project.id && entry.parentId === parentId
			).length
		},
		timestamp
	);
	if (decision.kind === 'invalid') throw new Error(decision.message);
	return decision.note;
};

/** Match the trash placement rules while retaining the complete local note. */
export const noteTrashWrite = (
	note: Note,
	action: 'archive' | 'restore',
	notes: readonly Note[],
	timestamp: DateTime
): WriteContent<WorkspaceCommand, WorkspaceRecord> => {
	if (action === 'archive') {
		const decision = decideNoteArchive(
			note,
			notes.some((entry) => entry.parentId === note.id && !entry.archivedAt)
		);
		if (decision.kind === 'invalid') throw new Error(decision.message);
		return {
			command: { kind: 'archiveNote', noteId: note.id },
			local: { type: 'notes', value: { ...note, archivedAt: timestamp, updatedAt: timestamp } },
			coalesce: null,
			references: []
		};
	}
	const parent = notes.find((entry) => entry.id === note.parentId);
	const decision = decideNoteRestore(note, parent ?? null);
	if (decision.kind === 'invalid') throw new Error(decision.message);
	const { archivedAt, ...rest } = note;
	void archivedAt;
	const { parentId, ...detached } = rest;
	void parentId;
	const local: Note =
		decision.placement === 'root'
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
): MemoryEntry => {
	const decision = decideMemoryCreation(input, { id, userId, timestamp });
	if (decision.kind === 'invalid') throw new Error(decision.message);
	return decision.entry;
};

export const memoryWrite = (
	entry: MemoryEntry,
	patch: Omit<UpdateMemoryEntryInput, 'memoryEntryId'>
): WriteContent<WorkspaceCommand, WorkspaceRecord> => {
	const decision = decideMemoryEdit(entry, patch, entry.updatedAt);
	if (decision.kind === 'invalid') throw new Error(decision.message);
	return {
		command: { kind: 'updateMemory', memoryEntryId: entry.id, ...patch },
		local: { type: 'memory_entries', value: decision.entry },
		coalesce: null,
		references: []
	};
};

export const skillMetadataWrite = (
	entry: WorkspaceValues['skills'],
	patch: Omit<Extract<WorkspaceCommand, { kind: 'updateSkill' }>, 'kind' | 'noteId'>
): WriteContent<WorkspaceCommand, WorkspaceRecord> => ({
	command: { kind: 'updateSkill', noteId: entry.noteId, ...patch },
	local: {
		type: 'skills',
		value: {
			...entry,
			...applySkillMetadataEdit(entry, patch),
			name: patch.displayName?.trim() || entry.name
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

/** Commands whose meaning depends on a complete collection rather than one loaded record. */
export function workspaceCommandNeedsInventory(
	command: PreparedWorkspaceCommand,
	observed: WorkspaceRecord | null,
	records: ReadonlyMap<string, WorkspaceRecord>
): boolean {
	switch (command.kind) {
		case 'createNote':
		case 'createFolder':
			return true;
		case 'archiveNote':
			return observed?.type === 'notes' && observed.value.kind === 'folder';
		case 'restoreNote': {
			if (observed?.type !== 'notes') return false;
			const parent = observed.value.parentId
				? records.get(workspaceResourceKey({ type: 'notes', id: [observed.value.parentId] }))
				: undefined;
			const decision = decideNoteRestore(
				observed.value,
				parent?.type === 'notes' ? parent.value : null
			);
			return decision.kind === 'restore' && decision.placement === 'root';
		}
		default:
			return false;
	}
}

/** Derive local effects from the command and the version this editor actually observed. */
export const prepareWorkspaceCommand = (
	command: PreparedWorkspaceCommand,
	observed: WorkspaceRecord | null,
	context: WorkspaceCommandContext
): WriteContent<WorkspaceCommand, WorkspaceRecord> => {
	if (
		workspaceCommandNeedsInventory(command, observed, context.records) &&
		context.inventory !== 'complete'
	)
		throw new Error(
			'Required workspace data is not available on this device. Reconnect and retry.'
		);
	const { userId, now, records } = context;
	const value = <K extends WorkspaceRecord['type']>(type: K): WorkspaceValues[K] => {
		if (!observed || !isWorkspaceRecord(observed, type))
			throw new Error('Open the resource before editing');
		return observed.value;
	};
	const content = (
		local: WorkspaceRecord | null,
		references: readonly string[] = [],
		coalesce: string | null = null
	): WriteContent<WorkspaceCommand, WorkspaceRecord> => ({ command, local, references, coalesce });
	const projectKey = (id: ProjectId) => workspaceResourceKey({ type: 'projects', id: [id] });
	const notes = () =>
		[...records.values()].filter((record) => record.type === 'notes').map((record) => record.value);
	switch (command.kind) {
		case 'createProject':
			return content({
				type: 'projects',
				value: newProject(command.id, userId, command.name, now)
			});
		case 'createNote':
		case 'createFolder': {
			const project = records.get(projectKey(command.projectId));
			if (project?.type !== 'projects') throw new Error('The project is unavailable');
			const note = newNote(
				command.id,
				project.value,
				command.kind === 'createNote' ? command.title : command.name,
				command.kind === 'createNote' ? 'note' : 'folder',
				notes(),
				now,
				command.parentId
			);
			return content({ type: 'notes', value: note }, [
				projectKey(command.projectId),
				...(command.parentId
					? [workspaceResourceKey({ type: 'notes', id: [command.parentId] })]
					: [])
			]);
		}
		case 'renameProject': {
			const decision = decideProjectDetails(command);
			if (decision.kind === 'invalid') throw new Error(decision.message);
			return content({
				type: 'projects',
				value: {
					...value('projects'),
					name: decision.name,
					description: decision.description,
					updatedAt: now
				}
			});
		}
		case 'archiveProject':
			return content({
				type: 'projects',
				value: { ...value('projects'), archivedAt: now, updatedAt: now }
			});
		case 'projectNumbering':
			return content({
				type: 'projects',
				value: { ...value('projects'), sectionNumberingDefault: command.enabled, updatedAt: now }
			});
		case 'renameNote':
			return content({
				type: 'notes',
				value: { ...value('notes'), title: command.title.trim(), updatedAt: now }
			});
		case 'noteNumbering':
			return content({
				type: 'notes',
				value: { ...value('notes'), sectionNumbering: command.enabled, updatedAt: now }
			});
		case 'saveNote': {
			const note = value('notes');
			return content(
				{
					type: 'notes',
					value: applyNoteDraftEdit(note, command, now)
				},
				[],
				'document'
			);
		}
		case 'publishNote': {
			const note = value('notes');
			return content({
				type: 'notes',
				value: { ...note, publishedRevision: note.currentRevision, publishedAt: now }
			});
		}
		case 'archiveNote':
		case 'restoreNote':
			return noteTrashWrite(
				value('notes'),
				command.kind === 'archiveNote' ? 'archive' : 'restore',
				notes(),
				now
			);
		case 'createTodo': {
			const decision = decideTodoCreation(command, { id: command.id, userId, timestamp: now });
			if (decision.kind === 'invalid') throw new Error(decision.message);
			return content({ type: 'todos', value: decision.todo }, [projectKey(command.projectId)]);
		}
		case 'updateTodo': {
			const { kind, todoId, ...patch } = command;
			void kind;
			void todoId;
			return todoWrite(value('todos'), patch, now);
		}
		case 'createMemory':
			return content(
				{ type: 'memory_entries', value: newMemory(command.id, userId, command, now) },
				command.projectId ? [projectKey(command.projectId)] : []
			);
		case 'updateMemory': {
			const { kind, memoryEntryId, ...patch } = command;
			void kind;
			void memoryEntryId;
			return memoryWrite(value('memory_entries'), patch);
		}
		case 'deleteTodo':
		case 'deleteMemory':
		case 'resetProjectToolOverride':
			return content(null);
		case 'renameConversation':
			return content({
				type: 'conversations',
				value: { ...value('conversations'), title: command.title.trim(), updatedAt: now }
			});
		case 'updateSkill': {
			const { kind, noteId, ...patch } = command;
			void kind;
			void noteId;
			return skillMetadataWrite(value('skills'), patch);
		}
		case 'updateAgentPreferences':
			return agentPreferenceWrite(value('agent_preferences'), command.patch);
		case 'updateUserPreferences':
			return content({
				type: 'user_preferences',
				value: {
					...value('user_preferences'),
					sectionNumberingDefault: command.sectionNumberingDefault,
					updatedAt: now
				}
			});
		case 'updateExportSettings':
			return content(
				{
					type: 'export_settings',
					value: { ...value('export_settings'), settings: command.settings, updatedAt: now }
				},
				[projectKey(command.projectId)]
			);
		case 'updateTrustPolicy':
			return content({
				type: 'trust_policies',
				value: {
					...value('trust_policies'),
					autoAcceptEnabled: command.autoAcceptEnabled,
					minimumConfidence: command.minimumConfidence,
					updatedAt: now
				}
			});
		case 'setToolPreference':
			return content({
				type: 'tool_preferences',
				value: { ...value('tool_preferences'), enabled: command.enabled, updatedAt: now }
			});
		case 'setProjectToolOverride':
			return content(
				{
					type: 'project_tool_overrides',
					value: { ...value('project_tool_overrides'), enabled: command.enabled, updatedAt: now }
				},
				[projectKey(command.projectId)]
			);
		case 'renameDiagram':
			return content({
				type: 'diagrams',
				value: { ...value('diagrams'), title: command.title.trim(), updatedAt: now }
			});
		case 'archiveDiagram':
		case 'restoreDiagram':
		case 'deleteDiagram': {
			const diagram = value('diagrams');
			const action =
				command.kind === 'archiveDiagram'
					? 'archive'
					: command.kind === 'restoreDiagram'
						? 'restore'
						: 'delete';
			const decision = decideDiagramTrash(action, diagram);
			if (decision.kind === 'invalid') throw new Error(decision.message);
			if (command.kind === 'deleteDiagram') return content(null);
			const { archivedAt, ...restored } = diagram;
			void archivedAt;
			return content({
				type: 'diagrams',
				value:
					command.kind === 'archiveDiagram'
						? { ...diagram, archivedAt: now, updatedAt: now }
						: { ...restored, updatedAt: now }
			});
		}
		case 'saveDiagram':
		case 'publishDiagram': {
			const diagram = value('diagrams');
			if (diagram.kind !== 'drawio') throw new Error('Only draw.io diagrams can be edited');
			const decision = decideRevisionWrite(
				{
					kind: command.kind === 'saveDiagram' ? 'save' : 'publish',
					baseMatches: true,
					contentChanged: diagram.source !== command.source
				},
				diagram,
				{ acceptUnchangedRetry: true }
			);
			if (decision.kind === 'conflict') throw new Error('The diagram changed since it was loaded');
			const revision =
				decision.kind === 'write' ? decision.currentRevision : diagram.currentRevision;
			return content(
				{
					type: 'diagrams',
					value: {
						...diagram,
						source: command.source,
						currentRevision: revision,
						updatedAt: now,
						...(command.kind === 'publishDiagram'
							? { renderedSvg: command.renderedSvg, publishedRevision: revision, publishedAt: now }
							: {})
					}
				},
				[],
				command.kind === 'saveDiagram' ? 'document' : null
			);
		}
		default:
			throw new Error(`Unhandled command: ${command satisfies never}`);
	}
};
