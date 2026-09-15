import { requireRouteResource, routeResourceId } from '$lib/client/sync/route-access';
import { resourceDataSchemas } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, params }) => {
	const { session } = await parent();
	const conversationId = routeResourceId(resourceDataSchemas.conversations.shape.id, params.id);
	const opened = await session.resources.open({ type: 'conversations', id: [conversationId] });
	requireRouteResource(opened, session.resources.online, 'chat');
	await session.resources.prepare();
	return { conversationId };
};
