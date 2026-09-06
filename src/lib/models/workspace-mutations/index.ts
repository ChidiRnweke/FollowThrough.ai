import { z } from 'zod';
import { syncEtagSchema } from '$lib/models/sync';
import {
	noteRecordSchema,
	projectRecordSchema,
	todoRecordSchema,
	workspaceObjectReadSchema,
	workspaceWriteReceiptSchema
} from '$lib/models/workspace-records';
import type { WorkspaceResourceIdentity } from '$lib/models/workspace-sync';

const noteId = noteRecordSchema.shape.id;
const projectId = projectRecordSchema.shape.id;
const todoId = todoRecordSchema.shape.id;

export const workspaceCommandSchema = z.discriminatedUnion('kind', [
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
	z.object({ kind: z.literal('renameNote'), noteId, title: z.string().trim().min(1) }),
	z.object({
		kind: z.literal('saveNote'),
		noteId,
		document: noteRecordSchema.shape.document,
		plainText: z.string()
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
		responsibility: todoRecordSchema.shape.responsibility
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
	z.object({ kind: z.literal('deleteTodo'), todoId })
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
export type SkillMutationRequest = MutationFor<'createSkill'>;

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
