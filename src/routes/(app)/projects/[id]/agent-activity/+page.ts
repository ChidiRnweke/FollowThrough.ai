import { workspacePresentation } from '$lib/factories/workspace/presentation';
import { prepareRoute, requireRouteResource, routeResourceId } from '$lib/client/sync/route-access';
import { projectRecordSchema } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, params }) => {
	const projectId = routeResourceId(projectRecordSchema.shape.id, params.id);
	const { session } = await parent();
	const routeReady = prepareRoute(async () => {
		const opened = await session.resources.open({ type: 'projects', id: [projectId] });
		requireRouteResource(workspacePresentation, opened, session.resources.online, 'project');
		await session.resources.prepare();
	});
	return { routeReady, projectId };
};
