import { requireRouteResource, routeResourceId } from '$lib/client/sync/route-access';
import { readTodoListFilter } from '$lib/client/todos/list-filter';
import { projectRecordSchema } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, params, url }) => {
	const projectId = routeResourceId(projectRecordSchema.shape.id, params.id);
	const filter = { ...readTodoListFilter(url.searchParams), projectId };
	const { session } = await parent();
	const opened = await session.resources.open({ type: 'projects', id: [projectId] });
	requireRouteResource(opened, session.resources.online, 'project');
	await session.resources.prepare();
	return { projectId, filter, view: url.searchParams.get('view') ?? 'board' };
};
