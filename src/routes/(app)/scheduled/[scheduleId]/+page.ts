import { workspacePresentation } from '$lib/factories/workspace/presentation';
import { prepareRoute, requireRouteResource, routeResourceId } from '$lib/client/sync/route-access';
import { scheduleRecordFields } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, params }) => {
	const { session } = await parent();
	const scheduleId = routeResourceId(scheduleRecordFields.id, params.scheduleId);
	const routeReady = prepareRoute(async () => {
		const opened = await session.resources.open({ type: 'schedules', id: [scheduleId] });
		requireRouteResource(workspacePresentation, opened, session.resources.online, 'schedule');
	});
	return { routeReady, scheduleId };
};
