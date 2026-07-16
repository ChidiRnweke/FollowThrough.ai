import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { AttachmentUploadId, NoteId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

const id = z.string().uuid();
const path = z.string().min(1).max(512);

export const GET: RequestHandler = async ({ url }) => {
	const noteId = id.parse(url.searchParams.get('noteId')) as NoteId;
	return json(await AppFactory.controllerFactory().attachments().list(AppFactory.actor(), noteId));
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
			noteId: id,
			path,
			mediaType: z.string().min(1),
			byteSize: z.number().int().positive(),
			checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i)
		})
		.parse(body);
	return json(await controller.initiate(actor, { ...input, noteId: input.noteId as NoteId }));
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = z.object({ noteId: id, path }).parse(await request.json());
	await AppFactory.controllerFactory()
		.attachments()
		.remove(AppFactory.actor(), body.noteId as NoteId, body.path);
	return new Response(null, { status: 204 });
};
