import { z } from 'zod';

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

export const runIdInput = z.object({ runId: z.string().uuid() });

/**
 * `projectId`/`noteId` are the scope frozen when the request was staged; the
 * snapshot is captured at send time. They diverge whenever the user moves
 * screens in between, which is ordinary and must not be rejected — the
 * controller keeps the live snapshot as the effective scope and forwards the
 * staged one to the agent as `requestedScope`.
 */
export const submitAgentRunSchema = z
	.object({
		requestId: id,
		conversationId: id.optional(),
		input: z.string().trim(),
		images: z
			.array(
				z.object({
					id,
					mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
					dataUrl: z.string().max(14_000_000),
					name: z.string().min(1).max(255)
				})
			)
			.max(4)
			.optional(),
		model: z.string().nullable().optional(),
		visionModel: z.string().nullable().optional(),
		mode: z.enum(['approval_required', 'auto_accept']).nullable().optional(),
		projectId: id.optional(),
		noteId: id.optional(),
		selection: selectionSchema.optional(),
		contextNoteIds: z.array(id).optional(),
		requestedSkillNames: z.array(z.string()).optional(),
		requestedSkillNoteIds: z.array(id).optional(),
		appContext: appContextSchema.optional(),
		retryUserOrdinal: z.number().int().min(1).optional()
	})
	.refine((input) => input.input.length > 0 || Boolean(input.images?.length), {
		message: 'A message or image is required.'
	});
