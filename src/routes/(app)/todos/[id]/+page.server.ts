import { error } from '@sveltejs/kit';
import type { TodoId } from '$lib/models/todos';
import { AppFactory } from '$lib/server/app-factory';
import { safeReturnUrl } from '$lib/client/todos/return-url';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	try {
		const view = await AppFactory.controllers()
			.todos()
			.get(AppFactory.actor(locals), { todoId: params.id as TodoId });
		return { view, returnTo: safeReturnUrl(url.searchParams.get('returnTo')) };
	} catch {
		error(404, 'Todo not found');
	}
};
