import { type Note } from '$lib/models/notes';
import type { WriteDraft } from '$lib/models/outbox';
import { workspaceRecordIdentity, type WorkspaceRecord } from '$lib/models/workspace-records';
import { workspaceResourceKey, type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
/** One identity rule for queue dependencies, optimistic views, guards, and receipts. */
export const mutationResource = (command: WorkspaceCommand): WorkspaceResourceIdentity => {
	switch (command.kind) {
		case 'renameConversation':
			return { type: 'conversations', id: [command.conversationId] };
		case 'setToolPreference':
			return { type: 'tool_preferences', id: [command.userId, command.toolName] };
		case 'setProjectToolOverride':
		case 'resetProjectToolOverride':
			return {
				type: 'project_tool_overrides',
				id: [command.userId, command.projectId, command.toolName]
			};
		case 'updateTrustPolicy':
			return { type: 'trust_policies', id: [command.userId, command.pipeline] };

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
			return { type: 'notes', id: [command.id] };
		case 'createTodo':
			return { type: 'todos', id: [command.id] };
		case 'updateTodo':
		case 'deleteTodo':
			return { type: 'todos', id: [command.todoId] };
		default:
			return { type: 'notes', id: [command.noteId] };
	}
};

/** Serialize only editable note fields into a command. */
export const noteCommand = (
	note: Pick<Note, 'id' | 'document' | 'plainText' | 'title' | 'isPinned'>
): Extract<WorkspaceCommand, { kind: 'saveNote' }> => ({
	kind: 'saveNote',
	noteId: note.id,
	document: note.document,
	plainText: note.plainText,
	title: note.title,
	isPinned: note.isPinned
});

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
