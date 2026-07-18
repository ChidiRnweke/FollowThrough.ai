import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { AttachmentId, AttachmentUploadId, NoteId, ProjectId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

const id = z.string().uuid();
const path = z.string().min(1).max(512);

export const GET: RequestHandler = async ({ url }) => {
	const controller = AppFactory.controllerFactory().attachments();
	const projectId = url.searchParams.get('projectId');
	if (projectId)
		return json(
			await controller.listForProject(AppFactory.actor(), id.parse(projectId) as ProjectId)
		);
	return json(
		await controller.list(AppFactory.actor(), id.parse(url.searchParams.get('noteId')) as NoteId)
	);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = z.record(z.string(), z.unknown()).parse(await request.json());
	const controller = AppFactory.controllerFactory().attachments();
	const actor = AppFactory.actor();
	if (body.op === 'complete')
		return json(await controller.complete(actor, id.parse(body.uploadId) as AttachmentUploadId));
	if (body.op === 'download')
		return json(
			await controller.download(actor, id.parse(body.noteId) as NoteId, path.parse(body.path))
		);
	if (body.op === 'downloadById')
		return json(await controller.downloadById(actor, id.parse(body.attachmentId) as AttachmentId));
	if (body.op === 'retry')
		return json(await controller.retry(actor, id.parse(body.attachmentId) as AttachmentId));
	if (body.op === 'read')
		return json(
			await controller.read(
				actor,
				id.parse(body.noteId) as NoteId,
				path.parse(body.path),
				z.number().int().nonnegative().optional().parse(body.offset),
				z.number().int().positive().max(20_000).optional().parse(body.limit)
			)
		);
	const input = z
		.object({
			noteId: id.optional(),
			projectId: id.optional(),
			path,
			mediaType: z.string().min(1),
			byteSize: z.number().int().positive(),
			checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i)
		})
		.refine(
			(value) => Number(Boolean(value.noteId)) + Number(Boolean(value.projectId)) === 1,
			'Provide exactly one owner'
		)
		.parse(body);
	return json(
		await controller.initiate(actor, {
			path: input.path,
			mediaType: input.mediaType,
			byteSize: input.byteSize,
			checksumSha256: input.checksumSha256,
			...(input.noteId ? { noteId: input.noteId as NoteId } : {}),
			...(input.projectId ? { projectId: input.projectId as ProjectId } : {})
		})
	);
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = z
		.object({ noteId: id.optional(), path: path.optional(), attachmentId: id.optional() })
		.parse(await request.json());
	if (body.attachmentId) {
		await AppFactory.controllerFactory()
			.attachments()
			.removeById(AppFactory.actor(), body.attachmentId as AttachmentId);
		return new Response(null, { status: 204 });
	}
	await AppFactory.controllerFactory()
		.attachments()
		.remove(AppFactory.actor(), body.noteId as NoteId, body.path!);
	return new Response(null, { status: 204 });
};
