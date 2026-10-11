import { workspacePresentation } from '$lib/factories/workspace/presentation';
import { prepareRoute, requireRouteResource, routeResourceId } from '$lib/client/sync/route-access';
import { readTodoListFilter } from '$lib/client/todos/list-filter';
import { projectRecordSchema } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, params, url }) => {
	const projectId = routeResourceId(projectRecordSchema.shape.id, params.id);
	const filter = { ...readTodoListFilter(url.searchParams), projectId };
	const { session } = await parent();
	const routeReady = prepareRoute(async () => {
		const opened = await session.resources.open({ type: 'projects', id: [projectId] });
		requireRouteResource(workspacePresentation, opened, session.resources.online, 'project');
		await session.resources.prepare();
	});
	return { routeReady, projectId, filter, view: url.searchParams.get('view') ?? 'board' };
};
