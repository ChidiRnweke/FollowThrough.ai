import { z } from 'zod';
import { appliedWriteProofSchema } from '$lib/models/outbox';
import { exportSettingsSchema } from '$lib/models/deliverables';
import { type DiagramId } from '$lib/models/diagrams';
import type { UserId } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import { syncEtagSchema } from '$lib/models/sync';
import {
	resourceDataSchemas,
	noteRecordSchema,
	projectRecordSchema,
	todoRecordFields,
	workspaceObjectReadSchema,
	workspaceWriteReceiptSchema,
	type WorkspaceRecord
} from '$lib/models/workspace-records';
const noteId = noteRecordSchema.shape.id;

const projectId = projectRecordSchema.shape.id;

const todoId = todoRecordFields.id;

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
		kind: z.literal('renameConversation'),
		conversationId: resourceDataSchemas.conversations.shape.id,
		title: z.string().trim().min(1).max(80)
	}),
	z.object({
		kind: z.literal('setToolPreference'),
		userId: resourceDataSchemas.user_preferences.shape.userId,
		toolName: z.string().min(1),
		enabled: z.boolean()
	}),
	z.object({
		kind: z.literal('setProjectToolOverride'),
		userId: resourceDataSchemas.user_preferences.shape.userId,
		projectId,
		toolName: z.string().min(1),
		enabled: z.boolean()
	}),
	z.object({
		kind: z.literal('resetProjectToolOverride'),
		userId: resourceDataSchemas.user_preferences.shape.userId,
		projectId,
		toolName: z.string().min(1)
	}),
	z.object({
		kind: z.literal('updateTrustPolicy'),
		userId: resourceDataSchemas.user_preferences.shape.userId,
		pipeline: resourceDataSchemas.trust_policies.shape.pipeline,
		autoAcceptEnabled: z.boolean(),
		minimumConfidence: resourceDataSchemas.trust_policies.shape.minimumConfidence
	}),

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
		settings: exportSettingsSchema
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
	z.object({ kind: z.literal('noteNumbering'), noteId, enabled: z.boolean().optional() }),
	z.object({
		kind: z.literal('createTodo'),
		id: todoId,
		projectId,
		title: z.string().trim().min(1),
		responsibility: todoRecordFields.responsibility,
		status: todoRecordFields.status.optional()
	}),
	z.object({
		kind: z.literal('updateTodo'),
		todoId,
		status: todoRecordFields.status.optional(),
		title: z.string().trim().min(1).optional(),
		description: z.string().nullable().optional(),
		dueDate: todoRecordFields.dueDate.nullable(),
		responsibility: todoRecordFields.responsibility.optional(),
		priority: todoRecordFields.priority.nullable(),
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
	| 'noteNumbering'
>;

export type ProjectMutationRequest = MutationFor<
	'createProject' | 'renameProject' | 'archiveProject' | 'projectNumbering' | 'createFolder'
>;

export type TodoMutationRequest = MutationFor<'createTodo' | 'updateTodo' | 'deleteTodo'>;

export type ConversationMutationRequest = MutationFor<'renameConversation'>;

export type ToolPreferenceMutationRequest = MutationFor<
	'setToolPreference' | 'setProjectToolOverride' | 'resetProjectToolOverride'
>;

export type TrustPolicyMutationRequest = MutationFor<'updateTrustPolicy'>;

export type UserPreferenceMutationRequest = MutationFor<'updateUserPreferences'>;

export type AgentPreferenceMutationRequest = MutationFor<'updateAgentPreferences'>;

export type DeliverableMutationRequest = MutationFor<'updateExportSettings'>;

export type MemoryMutationRequest = MutationFor<'createMemory' | 'updateMemory' | 'deleteMemory'>;

export type SkillMutationRequest = MutationFor<'updateSkill'>;

export type DiagramMutationRequest = MutationFor<
	| 'saveDiagram'
	| 'renameDiagram'
	| 'publishDiagram'
	| 'archiveDiagram'
	| 'restoreDiagram'
	| 'deleteDiagram'
>;

export const workspaceMutationResultSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('proven'), proof: appliedWriteProofSchema }),
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

export type WorkspaceMutationCurrent = Extract<
	WorkspaceMutationResult,
	{ kind: 'conflict' }
>['remote'];

export type WorkspaceMutationPreparation =
	| { readonly kind: 'ready'; readonly current: WorkspaceMutationCurrent }
	| { readonly kind: 'finished'; readonly result: WorkspaceMutationResult };

export const workspaceWriteRecoverySchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('cancelled') }),
	z.object({ kind: z.literal('applied'), receipt: workspaceWriteReceiptSchema }),
	z.object({ kind: z.literal('proven'), proof: appliedWriteProofSchema })
]);

export type WorkspaceWriteRecovery = z.infer<typeof workspaceWriteRecoverySchema>;

/** Cancellation fences an operation without requiring its historical command schema. */
export const workspaceWriteCancellationSchema = z.object({
	operationId: z.string().uuid(),
	request: z.string().min(2)
});

export type WorkspaceWriteCancellation = z.infer<typeof workspaceWriteCancellationSchema>;

export type PreparedWorkspaceCommand = Exclude<WorkspaceCommand, { kind: 'discardNoteDraft' }>;

export interface WorkspaceCommandContext {
	readonly userId: UserId;
	readonly now: DateTime;
	readonly records: ReadonlyMap<string, WorkspaceRecord>;
	readonly inventory: 'complete' | 'partial';
}
