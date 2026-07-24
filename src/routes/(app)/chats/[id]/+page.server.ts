import { error } from '@sveltejs/kit';
import { AppFactory } from '$lib/server/app-factory';
import { NotFoundError, type ConversationId } from '$lib/models';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	try {
		return await AppFactory.controllerFactory()
			.agent()
			.getSession(AppFactory.actor(locals), params.id as ConversationId);
	} catch (cause) {
		if (cause instanceof NotFoundError) throw error(404, 'Chat not found');
		throw cause;
	}
};
