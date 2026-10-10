import { createWorkspaceCommands } from '$lib/factories/workspace/commands';
import type { WorkspaceCommandSource } from '$lib/controllers/workspace/commands';
import type {
	WorkspaceCommand,
	PreparedWorkspaceCommand,
	WorkspaceCommandContext
} from '$lib/models/workspace-mutations';
import type { WorkspaceRecord, WorkspaceValues } from '$lib/models/workspace-records';
import type { WriteContent, OutboxEntry } from '$lib/models/outbox';
import type { Project, ProjectId } from '$lib/models/projects';
import type { Note, NoteId } from '$lib/models/notes';
import type { Todo, UpdateTodoInput } from '$lib/models/todos';
import type {
	MemoryEntry,
	MemoryEntryId,
	CreateMemoryEntryInput,
	UpdateMemoryEntryInput
} from '$lib/models/memory';
import type { UpdateAgentPreferencesInput } from '$lib/models/agent';
import type { UserId } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
const { isWorkspaceRecord, workspaceRecordIdentity, workspaceResourceKey } =
	new WorkspaceCommandRulesService();
import { testActor, testNow } from './domain-builders';

class InMemoryCommandInventory implements WorkspaceCommandSource {
	readonly pending: readonly OutboxEntry<WorkspaceCommand, WorkspaceRecord>[] = [];
	constructor(private readonly context: WorkspaceCommandContext) {}
	get accountId() {
		return this.context.userId;
	}
	get records() {
		return this.context.records;
	}
	collectionReadiness(): 'ready' | 'unknown' {
		return this.context.inventory === 'complete' ? 'ready' : 'unknown';
	}
	async requireCollections(): Promise<void> {
		if (this.context.inventory !== 'complete')
			throw new Error(
				'Required workspace data is not available on this device. Reconnect and retry.'
			);
	}
}
const controller = createWorkspaceCommands();
/** Exercise the complete controller operation with an explicitly available or unavailable inventory. */
export const prepareWorkspaceCommand = (
	command: PreparedWorkspaceCommand,
	observed: WorkspaceRecord | null,
	context: WorkspaceCommandContext
) => controller.prepare(command, observed, new InMemoryCommandInventory(context), context.now);
const context = (
	userId: UserId,
	now: DateTime,
	records: readonly WorkspaceRecord[] = []
): WorkspaceCommandContext => ({
	userId,
	now,
	inventory: 'complete',
	records: new Map(
		records.map((record) => [workspaceResourceKey(workspaceRecordIdentity(record)), record])
	)
});
const value = <K extends WorkspaceRecord['type']>(
	type: K,
	write: WriteContent<WorkspaceCommand, WorkspaceRecord>
): WorkspaceValues[K] => {
	if (!write.local || !isWorkspaceRecord(write.local, type))
		throw new Error(`Expected prepared ${type}`);
	return write.local.value;
};
// These fixture conveniences translate scenario inputs only. Domain preparation stays in the controller.
export const newProject = async (id: ProjectId, userId: UserId, name: string, now: DateTime) =>
	value(
		'projects',
		await prepareWorkspaceCommand({ kind: 'createProject', id, name }, null, context(userId, now))
	);
export const newNote = async (
	id: NoteId,
	project: Project,
	title: string,
	kind: 'note' | 'folder',
	entries: readonly Note[],
	now: DateTime,
	parentId?: NoteId
) =>
	value(
		'notes',
		await prepareWorkspaceCommand(
			kind === 'note'
				? { kind: 'createNote', id, projectId: project.id, title, parentId }
				: { kind: 'createFolder', id, projectId: project.id, name: title, parentId },
			null,
			context(project.userId, now, [
				{ type: 'projects', value: project },
				...entries.map((note) => ({ type: 'notes' as const, value: note }))
			])
		)
	);
export const todoWrite = (todo: Todo, patch: Omit<UpdateTodoInput, 'todoId'>, now: DateTime) =>
	prepareWorkspaceCommand(
		{ kind: 'updateTodo', todoId: todo.id, ...patch },
		{ type: 'todos', value: todo },
		context(todo.userId, now)
	);
export const noteTrashWrite = (
	note: Note,
	action: 'archive' | 'restore',
	notes: readonly Note[],
	now: DateTime
) =>
	prepareWorkspaceCommand(
		{ kind: action === 'archive' ? 'archiveNote' : 'restoreNote', noteId: note.id },
		{ type: 'notes', value: note },
		context(
			note.userId,
			now,
			notes.map((note) => ({ type: 'notes' as const, value: note }))
		)
	);
export const newMemory = async (
	id: MemoryEntryId,
	userId: UserId,
	input: CreateMemoryEntryInput & { readonly shareWithAgents: boolean },
	now: DateTime
) =>
	value(
		'memory_entries',
		await prepareWorkspaceCommand(
			{ kind: 'createMemory', id, ...input },
			null,
			context(userId, now)
		)
	);
export const memoryWrite = (
	entry: MemoryEntry,
	patch: Omit<UpdateMemoryEntryInput, 'memoryEntryId'>
) =>
	prepareWorkspaceCommand(
		{ kind: 'updateMemory', memoryEntryId: entry.id, ...patch },
		{ type: 'memory_entries', value: entry },
		context(entry.userId, entry.updatedAt)
	);
export const skillMetadataWrite = (
	entry: WorkspaceValues['skills'],
	patch: Omit<Extract<WorkspaceCommand, { kind: 'updateSkill' }>, 'kind' | 'noteId'>
) =>
	prepareWorkspaceCommand(
		{ kind: 'updateSkill', noteId: entry.noteId, ...patch },
		{ type: 'skills', value: entry },
		context(testActor().userId, testNow)
	);
export const agentPreferenceWrite = (
	entry: WorkspaceValues['agent_preferences'],
	patch: UpdateAgentPreferencesInput,
	now: DateTime
) =>
	prepareWorkspaceCommand(
		{ kind: 'updateAgentPreferences', userId: entry.userId, patch },
		{ type: 'agent_preferences', value: entry },
		context(entry.userId, now)
	);
