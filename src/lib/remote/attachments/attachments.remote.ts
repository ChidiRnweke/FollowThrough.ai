import { z } from 'zod';
import { command, form } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import type { AttachmentId, AttachmentUploadId } from '$lib/models/attachments';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { TodoId } from '$lib/models/todos';

const id = z.string().uuid();
const path = z.string().min(1).max(512);

/** Every attachment is scoped to exactly one owner, so the query key stays unambiguous. */
const exactlyOneOwner = (value: { noteId?: string; projectId?: string }): boolean =>
	Number(Boolean(value.noteId)) + Number(Boolean(value.projectId)) === 1;

export const initiateAttachmentUpload = command(
	z
		.object({
			noteId: id.optional(),
			projectId: id.optional(),
			path,
			mediaType: z.string().min(1),
			byteSize: z.number().int().positive(),
			checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i)
		})
		.refine(exactlyOneOwner, 'Provide exactly one owner'),
	async (input) =>
		AppFactory.controllers()
			.attachments()
			.initiate(requestActor(), {
				path: input.path,
				mediaType: input.mediaType,
				byteSize: input.byteSize,
				checksumSha256: input.checksumSha256,
				...(input.noteId ? { noteId: input.noteId as NoteId } : {}),
				...(input.projectId ? { projectId: input.projectId as ProjectId } : {})
			})
);

export const completeAttachmentUpload = command(z.object({ uploadId: id }), async (input) => {
	const view = await AppFactory.controllers()
		.attachments()
		.complete(requestActor(), input.uploadId as AttachmentUploadId);
	return view;
});

/**
 * Completes a screenshot pasted into a todo description. Separate from
 * {@link completeAttachmentUpload} because it also records the todo link; the
 * attachment itself is initiated through the ordinary project-owner branch, so
 * `initiateAttachmentUpload` needs no todo-specific shape.
 */
export const completeTodoScreenshotUpload = command(
	z.object({ uploadId: id, todoId: id }),
	async (input) => {
		const view = await AppFactory.controllers()
			.attachments()
			.completeForTodo(
				requestActor(),
				input.uploadId as AttachmentUploadId,
				input.todoId as TodoId
			);
		return view;
	}
);

export const retryAttachment = command(z.object({ attachmentId: id }), async (input) => {
	const view = await AppFactory.controllers()
		.attachments()
		.retry(requestActor(), input.attachmentId as AttachmentId);
	return view;
});

// Downloads are commands rather than queries: each call mints a presigned URL,
// which expires, so it must never be served from a query cache.
export const downloadAttachment = command(z.object({ attachmentId: id }), async (input) =>
	AppFactory.controllers()
		.attachments()
		.downloadById(requestActor(), input.attachmentId as AttachmentId)
);

export const downloadAttachmentByPath = command(z.object({ noteId: id, path }), async (input) =>
	AppFactory.controllers()
		.attachments()
		.download(requestActor(), input.noteId as NoteId, input.path)
);

export const removeAttachment = command(z.object({ attachmentId: id }), async (input) => {
	const result = await AppFactory.controllers()
		.attachments()
		.removeById(requestActor(), input.attachmentId as AttachmentId);
	return result;
});

/** A form rather than a command: it is one submit button per resource row. */
export const removeAttachmentByPath = form(z.object({ noteId: id, path }), async (input) => {
	await AppFactory.controllers()
		.attachments()
		.remove(requestActor(), input.noteId as NoteId, input.path);
	return { removed: input.path };
});
