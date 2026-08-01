import { redirect } from '@sveltejs/kit';
import type { AttachmentId } from '$lib/models/attachments';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { url } = await AppFactory.controllers()
		.attachments()
		.downloadById(AppFactory.actor(locals), params.id as AttachmentId);
	redirect(302, url, { external: true });
};
