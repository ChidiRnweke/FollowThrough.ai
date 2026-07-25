import { z } from 'zod';
import { command, query } from '$app/server';
import { AppFactory } from '$lib/server/app-factory';
import { requestActor } from './actor';
import type { AgentRunId, ConversationId, SubmitAgentRunInput } from '$lib/models';

const runIdInput = z.object({ runId: z.string().uuid() });
const id = z.string().uuid();
const selectionSchema = z.object({
	noteId: id,
	revision: z.number().int().nonnegative(),
	from: z.number().int().nonnegative(),
	to: z.number().int().nonnegative(),
	text: z.string()
});
const noteContextSchema = z.object({ id, title: z.string().max(500), projectId: id });
const appContextSchema = z.object({
	version: z.literal(1),
	capturedAt: z.string().datetime(),
	client: z.object({
		locale: z.string().max(100),
		timeZone: z.string().max(100),
		localDate: z.string().max(32),
		layout: z.enum(['compact', 'wide'])
	}),
	surface: z.object({
		kind: z.enum([
			'today',
			'todos',
			'project',
			'project_todos',
			'project_memory',
			'project_attachments',
			'artifacts',
			'note_workbench',
			'diagram_editor',
			'chats',
			'chat',
			'skills',
			'skill',
			'profile',
			'settings',
			'unknown'
		]),
		presentation: z.enum(['right_panel', 'full_page']),
		filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
	}),
	currentProject: z.object({ id, name: z.string().max(500) }).optional(),
	activeResource: z
		.object({
			kind: z.enum(['project', 'note', 'todo', 'artifact', 'diagram', 'skill', 'chat']),
			id: z.string().max(500),
			title: z.string().max(500),
			projectId: id.optional()
		})
		.optional(),
	workbench: z
		.object({
			openTabs: z.array(noteContextSchema).max(20),
			visiblePanes: z
				.array(
					noteContextSchema.extend({
						revision: z.number().int().nonnegative(),
						syncStatus: z.string().max(50),
						dirty: z.boolean(),
						dirtyExcerpt: z.string().max(4000).optional()
					})
				)
				.max(2),
			focusedNoteId: id.optional(),
			otherVisibleNoteId: id.optional()
		})
		.optional(),
	selection: selectionSchema.extend({ text: z.string().max(12000) }).optional(),
	recentInteractions: z
		.array(
			z.object({
				kind: z.enum(['focus', 'select', 'open', 'edit']),
				resourceKind: z.enum(['note', 'todo', 'artifact', 'diagram', 'skill', 'chat']),
				resourceId: z.string().max(500),
				occurredAt: z.string().datetime()
			})
		)
		.max(5)
});

const submitAgentRunSchema = z
	.object({
		requestId: id,
		conversationId: id.optional(),
		input: z.string().trim().min(1),
		model: z.string().nullable().optional(),
		mode: z.enum(['approval_required', 'auto_accept']).nullable().optional(),
		projectId: id.optional(),
		noteId: id.optional(),
		selection: selectionSchema.optional(),
		contextNoteIds: z.array(id).optional(),
		requestedSkillNames: z.array(z.string()).optional(),
		requestedSkillNoteIds: z.array(id).optional(),
		appContext: appContextSchema.optional()
	})
	.superRefine((value, context) => {
		if (!value.appContext) return;
		const contextProjectId =
			value.appContext.currentProject?.id ?? value.appContext.activeResource?.projectId;
		const contextNoteId =
			value.appContext.workbench?.focusedNoteId ??
			(value.appContext.activeResource?.kind === 'note'
				? value.appContext.activeResource.id
				: undefined);
		if (value.projectId && contextProjectId && value.projectId !== contextProjectId)
			context.addIssue({
				code: 'custom',
				path: ['projectId'],
				message: 'projectId contradicts appContext'
			});
		if (value.noteId && contextNoteId && value.noteId !== contextNoteId)
			context.addIssue({
				code: 'custom',
				path: ['noteId'],
				message: 'noteId contradicts appContext'
			});
	});

export const submitAgentRun = command(submitAgentRunSchema, async (input) =>
	AppFactory.controllerFactory()
		.agent()
		.submit(requestActor(), input as SubmitAgentRunInput)
);

export const getAgentRun = query(runIdInput, async ({ runId }) =>
	AppFactory.controllerFactory()
		.agent()
		.getRun(requestActor(), runId as AgentRunId)
);

export const decideAgentRun = command(
	z.object({
		runId: z.string().uuid(),
		callId: z.string().min(1),
		decision: z.enum(['approve', 'reject']),
		message: z.string().optional()
	}),
	async (input) =>
		AppFactory.controllerFactory()
			.agent()
			.decide(requestActor(), input as never)
);

export const cancelAgentRun = command(runIdInput, async ({ runId }) =>
	AppFactory.controllerFactory()
		.agent()
		.cancel(requestActor(), runId as AgentRunId)
);

export const retryAgentRun = command(
	z.object({ runId: z.string().uuid(), requestId: z.string().uuid() }),
	async ({ runId, requestId }) =>
		AppFactory.controllerFactory()
			.agent()
			.retry(requestActor(), runId as AgentRunId, requestId)
);

export const getSession = query(z.string().uuid(), async (conversationId) => {
	const factory = AppFactory.controllerFactory();
	return factory.agent().getSession(requestActor(), conversationId as ConversationId);
});

export const renameSession = command(
	z.object({ conversationId: z.string().uuid(), title: z.string().trim().min(1).max(80) }),
	async ({ conversationId, title }) =>
		AppFactory.controllerFactory()
			.agent()
			.renameSession(requestActor(), conversationId as never, title)
);

export const deleteSession = command(
	z.object({ conversationId: z.string().uuid() }),
	async ({ conversationId }) => {
		await AppFactory.controllerFactory()
			.agent()
			.deleteSession(requestActor(), conversationId as never);
	}
);
