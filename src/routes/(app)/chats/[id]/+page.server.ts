import { error } from '@sveltejs/kit';
import { AppFactory } from '$lib/server/app-factory';
import type { ConversationId } from '$lib/models/agent';
import { NotFoundError } from '$lib/errors';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	try {
		return await AppFactory.controllers()
			.agent()
			.getSession(AppFactory.actor(locals), params.id as ConversationId);
	} catch (cause) {
		if (cause instanceof NotFoundError) throw error(404, 'Chat not found');
		throw cause;
	}
};
