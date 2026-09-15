import { requireRouteResource, routeResourceId } from '$lib/client/sync/route-access';
import { todayLocalDate } from '$lib/client/todos/local-date';
import { projectRecordSchema } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, params }) => {
	const projectId = routeResourceId(projectRecordSchema.shape.id, params.id);
	const { session } = await parent();
	const opened = await session.resources.open({ type: 'projects', id: [projectId] });
	requireRouteResource(opened, session.resources.online, 'project');
	await session.resources.prepare();
	return {
		projectId,
		today: todayLocalDate(),
		renderedAt: new Date().toISOString(),
		tipSeed: Math.floor(Math.random() * 1000)
	};
};
