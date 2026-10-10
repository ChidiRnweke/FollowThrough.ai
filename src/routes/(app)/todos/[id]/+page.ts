import { workspacePresentation } from '$lib/factories/workspace/presentation';
import { prepareRoute, requireRouteResource, routeResourceId } from '$lib/client/sync/route-access';
import { todoRecordFields } from '$lib/models/workspace-records';
import { safeReturnUrl } from '$lib/client/todos/return-url';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url, parent }) => {
	const todoId = routeResourceId(todoRecordFields.id, params.id);
	const { session } = await parent();
	const routeReady = prepareRoute(async () => {
		const opened = await session.resources.open({ type: 'todos', id: [todoId] });
		requireRouteResource(workspacePresentation, opened, session.resources.online, 'todo');
		await session.resources.prepare();
	});
	return { routeReady, todoId, returnTo: safeReturnUrl(url.searchParams.get('returnTo')) };
};
