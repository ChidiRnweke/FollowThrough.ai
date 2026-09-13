import { requireRouteResource, routeResourceId } from '$lib/client/sync/route-access';
import { diagramRecordSchema } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, params }) => {
	const { session } = await parent();
	const diagramId = routeResourceId(diagramRecordSchema.options[0].shape.id, params.diagramId);
	const result = await session.resources.open({ type: 'diagrams', id: [diagramId] });
	requireRouteResource(result, session.resources.online, 'diagram');
	return { diagramId };
};
