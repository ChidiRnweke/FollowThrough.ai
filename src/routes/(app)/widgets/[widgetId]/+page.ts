import { prepareRoute, requireRouteResource, routeResourceId } from '$lib/client/sync/route-access';
import { widgetRecordSchema } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, params }) => {
	const { session } = await parent();
	const widgetId = routeResourceId(widgetRecordSchema.shape.id, params.widgetId);
	const routeReady = prepareRoute(async () => {
		const result = await session.resources.open({ type: 'widgets', id: [widgetId] });
		requireRouteResource(result, session.resources.online, 'widget');
	});
	return { routeReady, widgetId };
};
