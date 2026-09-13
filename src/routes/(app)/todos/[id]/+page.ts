import { requireRouteResource, routeResourceId } from '$lib/client/sync/route-access';
import { todoRecordSchema } from '$lib/models/workspace-records';
import { safeReturnUrl } from '$lib/client/todos/return-url';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url, parent }) => {
	const todoId = routeResourceId(todoRecordSchema.shape.id, params.id);
	const { session } = await parent();
	const opened = await session.resources.open({ type: 'todos', id: [todoId] });
	requireRouteResource(opened, session.resources.online, 'todo');
	await session.resources.prepare(['source_anchors', 'provenance']);
	return { todoId, returnTo: safeReturnUrl(url.searchParams.get('returnTo')) };
};
