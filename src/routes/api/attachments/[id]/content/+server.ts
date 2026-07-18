import { redirect } from '@sveltejs/kit';
import type { AttachmentId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const { url } = await AppFactory.controllerFactory()
		.attachments()
		.downloadById(AppFactory.actor(), params.id as AttachmentId);
	redirect(302, url);
};
