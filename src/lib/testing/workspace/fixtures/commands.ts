import type {
	WorkspaceCommand,
	PreparedWorkspaceCommand,
	WorkspaceCommandContext
} from '$lib/models/workspace-mutations';
import type { WorkspaceRecord, WorkspaceValues } from '$lib/models/workspace-records';
import type { WriteIntent } from '$lib/models/outbox';
import type { WorkspaceResourcesController } from '$lib/controllers/workspace/workspace';
import { syncCursorSchema, syncEtag } from '$lib/models/sync';
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
import { workspaceFixture } from './workspace';

type Creation = Parameters<WorkspaceResourcesController['create']>[0];
const creations: readonly string[] = [
	'createProject',
	'createNote',
	'createFolder',
	'createTodo',
	'createMemory',
	'createWidget'
] satisfies readonly Creation['kind'][];
const isCreation = (command: PreparedWorkspaceCommand): command is Creation =>
	creations.includes(command.kind);

/** The write a command queued: what it sends, the local version it shows, and how it coalesces. */
export type QueuedWrite = Pick<
	WriteIntent<WorkspaceCommand, WorkspaceRecord>,
	'command' | 'local' | 'coalesce'
>;

/**
 * Queue a command in an offline workspace whose device copy holds exactly the scenario's records,
 * as a creation or as an edit of `observed`. A complete inventory is a finished download; a
 * partial one is a download this tab has not finished. A refused command throws its message.
 */
export const prepareWorkspaceCommand = async (
	command: PreparedWorkspaceCommand,
	observed: WorkspaceRecord | null,
	context: WorkspaceCommandContext
): Promise<QueuedWrite> => {
	const fixture = workspaceFixture({ accountId: context.userId });
	const stored = new Map(context.records);
	if (observed) stored.set(workspaceResourceKey(workspaceRecordIdentity(observed)), observed);
	fixture.replica.seed(
		context.userId,
		[...stored].map(([key, value]) => ({
			key,
			entry: { kind: 'present' as const, snapshot: { etag: syncEtag(1n), value } }
		})),
		{ cursor: syncCursorSchema.parse('1'), inventoryComplete: context.inventory === 'complete' }
	);
	fixture.environment.fixedNow = context.now;
	const resources = await fixture.start(false);
	try {
		if (observed) {
			const draft = resources.draft(workspaceRecordIdentity(observed));
			await draft.read();
			const staged = await draft.stage(command);
			if (staged.kind === 'failure') throw new Error(staged.message);
		} else if (isCreation(command)) await resources.create(command);
		else throw new Error(`${command.kind} edits an existing resource`);
		const [queued] = fixture.replica.entries(context.userId);
		if (!queued) throw new Error('The command queued no write');
		return {
			command: queued.intent.command,
			local: queued.intent.local,
			coalesce: queued.intent.coalesce
		};
	} finally {
		fixture.workspace.stop();
	}
};
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
	write: QueuedWrite
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
